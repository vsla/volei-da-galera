import { supabase } from "./supabase";
import { generateNextMatch, type LockedPlayer } from "./match-generator";
import { applyMatchResult } from "./rotation";
import {
  DEFAULT_SETTINGS,
  resolveSettings,
  type PeladaSettings,
} from "./settings";
import type { PastMatch, SessionPlayer, Team } from "./types";

/** Papel dentro de uma pelada. Ver PRP-V2 §2. */
export type Role = "owner" | "admin" | "player" | "guest";

export type Pelada = {
  id: string;
  slug: string;
  name: string;
  coverUrl: string | null;
  weekday: number | null;
  joinCode: string | null;
  settings: PeladaSettings;
  /** Papel de quem está olhando, quando dá pra saber. */
  myRole: Role | null;
  memberCount: number;
};

/** Estado inteiro da noite. Uma leitura só, pra tela nunca ficar meio pronta. */
export type LiveState = {
  peladaId: string;
  peladaName: string;
  peladaSlug: string;
  /** Configuração já resolvida: padrão → pelada → sessão. */
  settings: PeladaSettings;
  sessionId: string;
  date: string;
  status: "open" | "playing" | "voting" | "closed";
  teamSize: number;
  maxStreak: number;
  championIds: string[];
  championStreak: number;
  /** Em qual lado está quem segura a quadra. Null = quadra livre. */
  championTeam: Team | null;
  /** Todos os jogadores cadastrados, com os dados da noite. */
  players: SessionPlayer[];
  activeMatch: {
    id: string;
    round: number;
    championStays: boolean;
    /** Lado de quem entrou defendendo a quadra. Null = partida do zero. */
    holderTeam: Team | null;
    championStreak: number;
    /** Quando a partida foi gerada — o cronômetro do placar sai daqui. */
    startedAt: string | null;
    /**
     * Placar corrente. Mora no banco desde a `0010`: antes vivia no
     * localStorage de um celular só e ninguém mais via.
     */
    scoreA: number;
    scoreB: number;
    teamA: SessionPlayer[];
    teamB: SessionPlayer[];
  } | null;
  /**
   * A última partida encerrada — o "entre partidas".
   *
   * Sem isso, terminar um jogo deixava a quadra vazia e o resultado só
   * vivia num modal: fechou, perdeu. Com ela, o estado "time B venceu e
   * está segurando a quadra esperando adversário" é derivado do banco,
   * igual pra todo mundo, e sobrevive a recarregar a página.
   */
  lastMatch: {
    round: number;
    winner: Team | null;
    scoreA: number | null;
    scoreB: number | null;
    teamA: SessionPlayer[];
    teamB: SessionPlayer[];
    finishedAt: string | null;
  } | null;
  history: PastMatch[];
  round: number;
  /** Papel de cada membro da pelada. */
  roles: Map<string, Role>;
};

type Row = Record<string, unknown>;

const iso = () => new Date().toISOString();

// ── Peladas ──────────────────────────────────────────────────

function toPelada(row: Row, myRole: Role | null, memberCount = 0): Pelada {
  return {
    id: row.id as string,
    slug: row.slug as string,
    name: row.name as string,
    coverUrl: (row.cover_url as string) ?? null,
    weekday: (row.weekday as number) ?? null,
    joinCode: (row.join_code as string) ?? null,
    settings: resolveSettings(row.settings as Row),
    myRole,
    memberCount,
  };
}

/** Todas as peladas, com o papel de quem está olhando. */
export async function fetchPeladas(meId: string | null): Promise<Pelada[]> {
  const [{ data: peladas }, { data: members }] = await Promise.all([
    supabase.from("peladas").select("*").order("name"),
    supabase.from("pelada_members").select("pelada_id, player_id, role, status"),
  ]);

  const counts = new Map<string, number>();
  const mine = new Map<string, Role>();
  for (const m of (members ?? []) as Row[]) {
    if (m.status === "removed") continue;
    const id = m.pelada_id as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (meId && m.player_id === meId) mine.set(id, m.role as Role);
  }

  return ((peladas ?? []) as Row[]).map((p) =>
    toPelada(p, mine.get(p.id as string) ?? null, counts.get(p.id as string) ?? 0),
  );
}

export async function fetchPeladaBySlug(slug: string): Promise<Pelada | null> {
  const { data } = await supabase.from("peladas").select("*").eq("slug", slug).limit(1);
  const row = (data ?? [])[0] as Row | undefined;
  return row ? toPelada(row, null) : null;
}

/**
 * Cria a pelada e já põe quem criou como dono.
 *
 * UMA chamada (`create_pelada`, migration 0017), não dois inserts.
 *
 * Em dois inserts isto quebrava com a RLS da 0014 de duas formas: sem
 * sessão, o primeiro já era recusado ("new row violates row-level
 * security policy for table peladas"); e com sessão, o segundo era
 * recusado porque a filiação de dono ia com o id do localStorage, que
 * quase nunca é o jogador daquela conta — deixando pelada criada e
 * ninguém dono dela.
 *
 * O nome de quem cria vai junto porque quem chega no site sem nunca ter
 * jogado não tem `player` nenhum — e a pelada precisa dele pra ter dono.
 */
export async function createPelada(input: {
  name: string;
  weekday?: number | null;
  ownerName?: string | null;
  settings?: Partial<PeladaSettings>;
}): Promise<{ id: string; slug: string } | null> {
  const { data, error } = await supabase.rpc("create_pelada", {
    p_name: input.name.trim(),
    p_weekday: input.weekday ?? null,
    p_owner_name: input.ownerName?.trim() || null,
    p_settings: { ...DEFAULT_SETTINGS, ...(input.settings ?? {}) },
  });

  if (error) throw new Error(friendlyWriteError(error.message));

  const row = (data as Row[] | null)?.[0];
  return row ? { id: row.id as string, slug: row.slug as string } : null;
}

/** Entrar por código. Devolve null quando o código não existe. */
export async function joinPeladaByCode(
  code: string,
  name?: string | null,
): Promise<{ id: string; slug: string } | null> {
  const { data, error } = await supabase.rpc("join_pelada", {
    p_code: code.trim().toUpperCase(),
    p_name: name?.trim() || null,
  });

  if (error) throw new Error(friendlyWriteError(error.message));

  const row = (data as Row[] | null)?.[0];
  return row ? { id: row.id as string, slug: row.slug as string } : null;
}

/**
 * Traduz o erro cru da RLS pro que a pessoa precisa fazer.
 *
 * "new row violates row-level security policy" não diz nada pra quem
 * está tentando criar a pelada da sexta — e a causa quase sempre é uma
 * só: o aparelho não tem sessão, porque o login anônimo está desligado
 * no painel do Supabase.
 */
function friendlyWriteError(raw: string): string {
  if (/row-level security|sem sessão|permission denied/i.test(raw)) {
    return "Este aparelho está sem sessão. Habilite 'Anonymous sign-ins' no painel do Supabase (Authentication → Providers) ou entre com e-mail.";
  }
  return raw;
}

export type Member = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  isGuest: boolean;
  role: Role;
  status: string;
  rating: number;
  joinedAt: string | null;
};

export async function fetchMembers(peladaId: string): Promise<Member[]> {
  const { data } = await supabase
    .from("pelada_members")
    .select("*, players(*)")
    .eq("pelada_id", peladaId);

  return ((data ?? []) as Row[])
    .map((m): Member | null => {
      const p = m.players as Row | null;
      if (!p) return null;
      return {
        playerId: p.id as string,
        name: p.name as string,
        avatarUrl: (p.avatar_url as string) ?? null,
        isGuest: Boolean(p.is_guest),
        role: (m.role as Role) ?? "player",
        status: (m.status as string) ?? "active",
        rating: Number(m.rating ?? 5),
        joinedAt: (m.joined_at as string) ?? null,
      };
    })
    .filter((m): m is Member => m !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export async function setMemberRole(
  peladaId: string,
  playerId: string,
  role: Role,
) {
  await supabase
    .from("pelada_members")
    .upsert(
      { pelada_id: peladaId, player_id: playerId, role },
      { onConflict: "pelada_id,player_id" },
    );
}

export async function removeMember(peladaId: string, playerId: string) {
  await supabase
    .from("pelada_members")
    .update({ status: "removed" })
    .eq("pelada_id", peladaId)
    .eq("player_id", playerId);
}

export async function savePeladaSettings(
  peladaId: string,
  settings: PeladaSettings,
) {
  const { error } = await supabase
    .from("peladas")
    .update({ settings })
    .eq("id", peladaId);
  if (error) throw new Error(error.message);
}

/**
 * Abre a sessão de hoje, se ainda não existir.
 *
 * A noite não é criada por cron nem à mão no SQL Editor: o primeiro
 * check-in da sexta cria a sessão. Uma pelada sem jogo hoje mostra a
 * quadra vazia, não um erro.
 */
export async function ensureTodaySession(peladaId: string, date: string) {
  const { error } = await supabase
    .from("sessions")
    .upsert(
      { pelada_id: peladaId, date, status: "open" },
      { onConflict: "pelada_id,date", ignoreDuplicates: true },
    );
  // abrir a noite é de quem é da pelada (`sessions_insert`, 0014) — quem
  // caiu no link sem estar na lista precisa entrar primeiro
  if (error) throw new Error(friendlyWriteError(error.message));
}

// ── O estado ao vivo ─────────────────────────────────────────

/**
 * O estado ao vivo, ou null quando a pelada REALMENTE não tem noite
 * aberta.
 *
 * Ela LEVANTA em vez de devolver null quando a leitura falha, e a
 * diferença entre as duas coisas não é preciosismo: quem chama mostra
 * "ninguém abriu a lista ainda" pro null, com um botão que cria a
 * sessão de HOJE. Numa rede de praia que caiu, isso criava uma noite
 * nova por cima de uma noite em andamento — e como a tela sempre pega
 * a sessão de data mais recente (o `order` logo abaixo), a noite de
 * verdade sumia da tela inteira, com check-in, partidas e votos.
 * Ninguém tinha apagado nada; só não dava mais pra chegar lá.
 */
export async function fetchState(peladaId: string): Promise<LiveState | null> {
  const { data: peladas, error: peladaErr } = await supabase
    .from("peladas")
    .select("*")
    .eq("id", peladaId)
    .limit(1);
  if (peladaErr) throw new Error(peladaErr.message);

  const pelada = (peladas ?? [])[0] as Row | undefined;
  if (!pelada) return null;

  const { data: sessions, error: sessionErr } = await supabase
    .from("sessions")
    .select("*")
    .eq("pelada_id", peladaId)
    .order("date", { ascending: false })
    .limit(1);
  if (sessionErr) throw new Error(sessionErr.message);

  const session = sessions?.[0] as Row | undefined;
  if (!session) return null;
  const sessionId = session.id as string;

  // As três também levantam. `sps` é a mais perigosa das leituras desta
  // função: se ela voltar nula, todo mundo sai daqui com
  // `checkedInAt: null` e a tela mostra a quadra vazia numa noite cheia
  // — o mesmo susto de "sumiu tudo", só que por outro caminho.
  const [
    { data: members, error: membersErr },
    { data: sps, error: spsErr },
    { data: matches, error: matchesErr },
  ] = await Promise.all([
    supabase
      .from("pelada_members")
      .select("*, players(*)")
      .eq("pelada_id", peladaId)
      .neq("status", "removed"),
    supabase.from("session_players").select("*").eq("session_id", sessionId),
    supabase
      .from("matches")
      .select("*, match_players(*)")
      .eq("session_id", sessionId)
      .order("round", { ascending: false })
      .limit(6),
  ]);

  const readErr = membersErr ?? spsErr ?? matchesErr;
  if (readErr) throw new Error(readErr.message);

  const byPlayer = new Map(
    (sps ?? []).map((s: Row) => [s.player_id as string, s]),
  );

  const roles = new Map<string, Role>();

  const merged: SessionPlayer[] = ((members ?? []) as Row[])
    .map((m): SessionPlayer | null => {
      const p = m.players as Row | null;
      if (!p) return null;
      const s = byPlayer.get(p.id as string);
      roles.set(p.id as string, (m.role as Role) ?? "player");
      return {
        id: p.id as string,
        name: p.name as string,
        avatarUrl: (p.avatar_url as string) ?? null,
        isGuest: Boolean(p.is_guest),
        // A NOTA É DA PELADA (0012), não da pessoa: a sua nota no vôlei
        // da sexta não diz nada sobre o vôlei de domingo
        rating: Number(m.rating ?? 5),
        checkedInAt: (s?.checked_in_at as string) ?? null,
        gamesPlayed: (s?.games_played as number) ?? 0,
        lastPlayedAt: (s?.last_played_at as string) ?? null,
        roundsWaiting: (s?.rounds_waiting as number) ?? 0,
        excluded: Boolean(s?.excluded),
      };
    })
    .filter((p): p is SessionPlayer => p !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const byId = new Map(merged.map((p) => [p.id, p]));
  const rows = (matches ?? []) as Row[];
  const active = rows.find((m) => m.status === "active");

  const teamOf = (m: Row, team: Team) =>
    ((m.match_players as Row[]) ?? [])
      .filter((mp) => mp.team === team)
      .map((mp) => byId.get(mp.player_id as string))
      .filter((p): p is SessionPlayer => Boolean(p));

  // rows vem ordenado por round desc, então o primeiro encerrado é o último jogo
  const last = rows.find((m) => m.status === "finished");

  const history: PastMatch[] = rows
    .filter((m) => m.status === "finished")
    .sort((a, b) => (a.round as number) - (b.round as number))
    .map((m) => ({
      round: m.round as number,
      teamA: teamOf(m, "A").map((p) => p.id),
      teamB: teamOf(m, "B").map((p) => p.id),
    }));

  // configuração: padrão → pelada → sessão. As colunas antigas
  // (team_size, max_streak) continuam mandando quando existem, pra
  // pelada que ainda não foi configurada pela tela nova não mudar de
  // regra sozinha no meio da noite.
  const settings = resolveSettings(pelada.settings as Row, {
    ...((session.settings as Row) ?? {}),
    ...(session.team_size ? { teamSize: session.team_size } : {}),
    ...(session.max_streak ? { maxStreak: session.max_streak } : {}),
  });

  return {
    peladaId,
    peladaName: pelada.name as string,
    peladaSlug: pelada.slug as string,
    settings,
    roles,
    sessionId,
    date: session.date as string,
    status: session.status as LiveState["status"],
    teamSize: settings.teamSize,
    maxStreak: settings.maxStreak,
    championIds: (session.champion_ids as string[]) ?? [],
    championStreak: (session.champion_streak as number) ?? 0,
    // sem a coluna (banco antes da 0011) o antigo padrão era "campeão é
    // sempre o A" — mantém a tela coerente até a migration rodar
    championTeam:
      ((session.champion_team as Team) ?? null) ||
      (((session.champion_ids as string[]) ?? []).length ? "A" : null),
    players: merged,
    activeMatch: active
      ? {
          id: active.id as string,
          round: active.round as number,
          championStays: Boolean(active.champion_stays),
          holderTeam:
            ((active.holder_team as Team) ?? null) ||
            (active.champion_stays ? "A" : null),
          championStreak: (active.champion_streak as number) ?? 0,
          startedAt: (active.created_at as string) ?? null,
          scoreA: Number(active.score_a ?? 0),
          scoreB: Number(active.score_b ?? 0),
          teamA: teamOf(active, "A"),
          teamB: teamOf(active, "B"),
        }
      : null,
    lastMatch: last
      ? {
          round: last.round as number,
          winner: (last.winner_team as Team) ?? null,
          scoreA: (last.score_a as number) ?? null,
          scoreB: (last.score_b as number) ?? null,
          teamA: teamOf(last, "A"),
          teamB: teamOf(last, "B"),
          finishedAt: (last.finished_at as string) ?? null,
        }
      : null,
    history,
    round: rows.length ? Math.max(...rows.map((m) => m.round as number)) : 0,
  };
}

// ─────────────────────────────────────────────────────────────

/**
 * Check-in. Erro aqui NÃO pode ser silencioso.
 *
 * Antes da RLS a escrita nunca era recusada, então ignorar o retorno era
 * inofensivo. Agora ela pode ser — e um check-in que falha calado é o
 * pior defeito possível neste app: a pessoa acha que está na fila, o
 * organizador não a vê, e a noite começa com uma briga.
 */
export async function checkIn(sessionId: string, playerId: string) {
  const { error } = await supabase
    .from("session_players")
    .upsert(
      { session_id: sessionId, player_id: playerId, checked_in_at: iso() },
      { onConflict: "session_id,player_id" },
    );
  if (error) throw new Error(friendlyWriteError(error.message));
}

export async function undoCheckIn(sessionId: string, playerId: string) {
  const { error } = await supabase
    .from("session_players")
    .update({ checked_in_at: null })
    .eq("session_id", sessionId)
    .eq("player_id", playerId);
  if (error) throw new Error(friendlyWriteError(error.message));
}

/**
 * Convidado: entra na pelada de hoje sem cadastro nenhum.
 *
 * Continua sendo 1 toque (`RESUMO.md`) — o que mudou é que agora ele
 * entra em UMA pelada, como `guest`, e não na lista global de nomes.
 */
export async function addGuest(
  peladaId: string,
  name: string,
): Promise<string | null> {
  // uma chamada só (`join_as_guest`, 0013): cria o jogador JÁ amarrado à
  // sessão de quem tocou e vira membro no mesmo passo. Separado em dois
  // inserts, a RLS da 0014 barraria o segundo — o convidado ainda não
  // seria ninguém quando tentasse entrar.
  const { data, error } = await supabase.rpc("join_as_guest", {
    p_pelada: peladaId,
    p_name: name.trim(),
  });
  if (error) throw new Error(error.message);
  return (data as string) ?? null;
}

/** Reabre a noite: zera contadores e limpa a quadra. */
export async function openSession(sessionId: string) {
  await supabase.from("sessions").update({ status: "open" }).eq("id", sessionId);
}

/**
 * Ajuste só desta noite ("veio pouca gente, hoje é 4×4").
 *
 * Grava em `sessions.settings`, que sobrescreve a pelada — a regra de
 * toda sexta continua intacta. As colunas antigas são atualizadas junto
 * enquanto existirem, pra não ficar duas verdades no banco.
 */
export async function setSessionConfig(
  sessionId: string,
  patch: Partial<PeladaSettings>,
) {
  const { data } = await supabase
    .from("sessions")
    .select("settings")
    .eq("id", sessionId)
    .single();

  const body: Row = {
    settings: { ...(((data?.settings as Row) ?? {}) as object), ...patch },
  };
  if (patch.teamSize) body.team_size = patch.teamSize;
  if (patch.maxStreak) body.max_streak = patch.maxStreak;
  await supabase.from("sessions").update(body).eq("id", sessionId);
}

// ─────────────────────────────────────────────────────────────

export type GenerateOutcome =
  | { ok: true }
  | { ok: false; missing: number; available: number; error?: string };

function dbFail(message: string, err?: { message?: string } | null): GenerateOutcome {
  const raw = err?.message ?? "";
  // coluna nova: migration 0002_court_state ainda não rodou no projeto
  if (/champion_stays|champion_ids|rating|column/i.test(raw)) {
    return {
      ok: false,
      missing: 0,
      available: 0,
      error: "Banco desatualizado — rode 0002_court_state.sql no SQL Editor do Supabase.",
    };
  }
  return {
    ok: false,
    missing: 0,
    available: 0,
    error: message + (raw ? ` (${raw})` : ""),
  };
}

export async function generateMatch(
  state: LiveState,
  opts: {
    locked?: LockedPlayer[];
    forceReshuffle?: boolean;
    nonce?: string;
    /** troca a partida ativa em vez de abrir a próxima rodada */
    replaceActive?: boolean;
  } = {},
): Promise<GenerateOutcome> {
  const replacing = Boolean(opts.replaceActive && state.activeMatch);
  const round = replacing ? state.activeMatch!.round : state.round + 1;
  const seed = `${state.sessionId}|${round}|${opts.nonce ?? Date.now()}`;

  const result = generateNextMatch({
    players: state.players,
    teamSize: state.teamSize,
    champion:
      !opts.forceReshuffle && state.championIds.length
        ? {
            playerIds: state.championIds,
            streak: state.championStreak,
            team: state.championTeam ?? "A",
          }
        : null,
    maxStreak: state.maxStreak,
    history: state.history,
    locked: opts.locked,
    forceReshuffle: opts.forceReshuffle,
    waitCap: state.settings.waitCap,
    seed,
  });

  if (!result.ok) {
    return { ok: false, missing: result.missing, available: result.available };
  }

  if (replacing && state.activeMatch) {
    // match_players tem DELETE na RLS; matches pode não ter — limpa escalação
    // e reaproveita a linha da rodada (update) pra não depender de apagar match.
    const matchId = state.activeMatch.id;
    const { error: clearErr } = await supabase
      .from("match_players")
      .delete()
      .eq("match_id", matchId);
    if (clearErr) return dbFail("Não deu pra limpar a escalação.", clearErr);

    const { error: updErr } = await supabase
      .from("matches")
      .update({
        status: "active",
        champion_stays: result.championStays,
        holder_team: result.holderTeam,
        champion_streak: state.championStreak,
        seed,
        winner_team: null,
        finished_at: null,
        score_a: 0,
        score_b: 0,
      })
      .eq("id", matchId);
    if (updErr) return dbFail("Não deu pra re-sortear a partida.", updErr);

    const { error: mpErr } = await supabase.from("match_players").insert([
      ...result.teamA.map((p) => ({ match_id: matchId, player_id: p.id, team: "A" })),
      ...result.teamB.map((p) => ({ match_id: matchId, player_id: p.id, team: "B" })),
    ]);
    if (mpErr) return dbFail("Não deu pra gravar os times.", mpErr);

    return { ok: true };
  }

  // apaga rascunho da mesma rodada se a RLS permitir; se não, o insert
  // único (session_id, round) ainda protege contra duplicata
  await supabase
    .from("matches")
    .delete()
    .eq("session_id", state.sessionId)
    .eq("round", round)
    .eq("status", "active");

  const { data: match, error: insErr } = await supabase
    .from("matches")
    .insert({
      session_id: state.sessionId,
      round,
      status: "active",
      champion_stays: result.championStays,
      holder_team: result.holderTeam,
      champion_streak: state.championStreak,
      seed,
      score_a: 0,
      score_b: 0,
    })
    .select("id")
    .single();

  if (!match) return dbFail("Não deu pra gravar a partida.", insErr);

  const { error: mpErr } = await supabase.from("match_players").insert([
    ...result.teamA.map((p) => ({ match_id: match.id, player_id: p.id, team: "A" })),
    ...result.teamB.map((p) => ({ match_id: match.id, player_id: p.id, team: "B" })),
  ]);
  if (mpErr) {
    // deixa a partida órfã limpa pra próxima tentativa
    await supabase.from("matches").delete().eq("id", match.id);
    return dbFail("Não deu pra gravar os times.", mpErr);
  }

  await supabase
    .from("sessions")
    .update({ status: "playing" })
    .eq("id", state.sessionId);

  return { ok: true };
}

// ── Placar ao vivo ───────────────────────────────────────────

/**
 * Marca um ponto. O incremento acontece DENTRO do banco (`bump_score`,
 * migration 0010): dois aparelhos marcando ao mesmo tempo somam dois
 * pontos, em vez de um sobrescrever o outro.
 *
 * Devolve o placar já novo pra quem marcou não esperar o realtime dar a
 * volta — na praia isso é meio segundo de diferença, e meio segundo num
 * botão de ponto é o que faz a pessoa tocar duas vezes.
 */
export async function bumpScore(
  matchId: string,
  team: Team,
  delta: number,
): Promise<{ a: number; b: number } | null> {
  const { data, error } = await supabase.rpc("bump_score", {
    p_match: matchId,
    p_team: team,
    p_delta: delta,
  });
  if (error) throw new Error(error.message);
  const row = (data as Row[] | null)?.[0];
  if (!row) return null;
  return { a: Number(row.score_a ?? 0), b: Number(row.score_b ?? 0) };
}

export async function resetScore(matchId: string) {
  const { error } = await supabase.rpc("reset_score", { p_match: matchId });
  if (error) throw new Error(error.message);
}

// ── Destaques do Dia ─────────────────────────────────────────

/** Quantos cada um pode escolher. */
export const VOTES_PER_PLAYER = 3;

export async function openVoting(sessionId: string) {
  await supabase.from("sessions").update({ status: "voting" }).eq("id", sessionId);
}

export async function closeVoting(sessionId: string) {
  await supabase.from("sessions").update({ status: "closed" }).eq("id", sessionId);
}

/**
 * Desfaz o "encerrar a noite".
 *
 * Encerrar é um toque só e vai acontecer sem querer — ou a galera
 * simplesmente decide jogar mais uma. Nada é apagado aqui: volta pra
 * quadra quem estava na quadra, e os votos já dados continuam de pé.
 */
export async function reopenSession(sessionId: string, hasMatches: boolean) {
  await supabase
    .from("sessions")
    .update({ status: hasMatches ? "playing" : "open" })
    .eq("id", sessionId);
}

/**
 * Zera a noite: partidas, check-ins, fila e votos desta data.
 *
 * NÃO mexe na nota — `players.rating` é acumulado de todas as noites, e
 * desfazer os ±0.5 exigiria reprocessar cada partida apagada. A tela
 * avisa isso antes de confirmar.
 */
export async function resetSession(sessionId: string) {
  // votos primeiro: eles referenciam a sessão, não as partidas
  await supabase.from("highlight_votes").delete().eq("session_id", sessionId);

  // match_players cai por cascade
  await supabase.from("matches").delete().eq("session_id", sessionId);

  await supabase
    .from("session_players")
    .update({
      games_played: 0,
      last_played_at: null,
      rounds_waiting: 0,
      checked_in_at: null,
      excluded: false,
    })
    .eq("session_id", sessionId);

  await supabase
    .from("sessions")
    .update({
      status: "open",
      champion_ids: [],
      champion_streak: 0,
      champion_team: null,
    })
    .eq("id", sessionId);
}

// ── Histórico ────────────────────────────────────────────────

export type PlayedMatch = {
  id: string;
  round: number;
  winner: Team | null;
  scoreA: number | null;
  scoreB: number | null;
  finishedAt: string | null;
  teamA: SessionPlayer[];
  teamB: SessionPlayer[];
};

/**
 * Todas as partidas encerradas da noite, da mais recente pra mais antiga.
 *
 * Fica fora do `fetchState` de propósito: o estado ao vivo é lido a cada
 * atualização e não pode crescer com a noite. Isto aqui só é buscado
 * quando alguém abre o histórico.
 */
export async function fetchDayMatches(
  sessionId: string,
  players: SessionPlayer[],
): Promise<PlayedMatch[]> {
  const { data } = await supabase
    .from("matches")
    .select("*, match_players(*)")
    .eq("session_id", sessionId)
    .eq("status", "finished")
    .order("round", { ascending: false });

  const byId = new Map(players.map((p) => [p.id, p]));
  const teamOf = (m: Row, team: Team) =>
    ((m.match_players as Row[]) ?? [])
      .filter((mp) => mp.team === team)
      .map((mp) => byId.get(mp.player_id as string))
      .filter((p): p is SessionPlayer => Boolean(p));

  return ((data ?? []) as Row[]).map((m) => ({
    id: m.id as string,
    round: m.round as number,
    winner: (m.winner_team as Team) ?? null,
    scoreA: (m.score_a as number) ?? null,
    scoreB: (m.score_b as number) ?? null,
    finishedAt: (m.finished_at as string) ?? null,
    teamA: teamOf(m, "A"),
    teamB: teamOf(m, "B"),
  }));
}

export type HighlightDay = {
  sessionId: string;
  date: string;
  winners: { id: string; name: string; votes: number }[];
};

/**
 * Os destaques de cada pelada. Passa pela função agregada do banco
 * (`highlight_days`, migration 0008) — a tabela de votos em si continua
 * ilegível pro cliente.
 */
export async function fetchHighlightDays(peladaId: string): Promise<HighlightDay[]> {
  const { data } = await supabase.rpc("highlight_days_pelada", {
    p_pelada: peladaId,
    p_limit: 30,
  });

  const byDay = new Map<string, HighlightDay>();
  for (const row of (data ?? []) as Row[]) {
    const id = row.session_id as string;
    const day = byDay.get(id) ?? {
      sessionId: id,
      date: row.played_on as string,
      winners: [],
    };
    day.winners.push({
      id: row.player_id as string,
      name: row.name as string,
      votes: Number(row.votes ?? 0),
    });
    byDay.set(id, day);
  }
  return [...byDay.values()];
}

// ── Estatísticas ─────────────────────────────────────────────

export type PlayerStats = {
  playerId: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  /** Quantas vezes foi destaque da noite. NUNCA quantos votos levou. */
  highlights: number;
  rating: number;
};

export async function fetchPlayerStats(peladaId: string): Promise<PlayerStats[]> {
  const { data } = await supabase.rpc("player_stats", { p_pelada: peladaId });
  return ((data ?? []) as Row[]).map((r) => ({
    playerId: r.player_id as string,
    name: r.name as string,
    games: Number(r.games ?? 0),
    wins: Number(r.wins ?? 0),
    losses: Number(r.losses ?? 0),
    highlights: Number(r.highlights ?? 0),
    rating: Number(r.rating ?? 5),
  }));
}

export type HeadToHead = {
  gamesTogether: number;
  winsTogether: number;
  gamesAgainst: number;
  winsA: number;
  winsB: number;
};

/** "Ganhei todas de fulaninho" — o pedido literal do playtest. */
export async function fetchHeadToHead(
  peladaId: string,
  a: string,
  b: string,
): Promise<HeadToHead | null> {
  const { data } = await supabase.rpc("head_to_head", {
    p_pelada: peladaId,
    p_a: a,
    p_b: b,
  });
  const r = (data as Row[] | null)?.[0];
  if (!r) return null;
  return {
    gamesTogether: Number(r.games_together ?? 0),
    winsTogether: Number(r.wins_together ?? 0),
    gamesAgainst: Number(r.games_against ?? 0),
    winsA: Number(r.wins_a ?? 0),
    winsB: Number(r.wins_b ?? 0),
  };
}

/**
 * Quem já votou — só isso, nunca em quem.
 *
 * Passa pela `highlight_voters` (migration 0009), que devolve `voter_id`
 * e a contagem, sem o votado. É o que o organizador precisa pra saber
 * quem cutucar, sem que ninguém consiga cruzar voto com votante.
 */
export async function fetchVoters(
  sessionId: string,
): Promise<Map<string, number> | null> {
  const { data, error } = await supabase.rpc("highlight_voters", {
    p_session_id: sessionId,
  });
  // devolve null, NÃO um mapa vazio: sem a função no banco, vazio seria
  // lido como "ninguém votou" e a tela cobraria voto de quem já votou.
  // Informação errada é pior que informação ausente.
  if (error || !data) return null;
  return new Map(
    (data as Row[]).map((r) => [r.voter_id as string, Number(r.votes ?? 0)]),
  );
}

/**
 * Os seus votos desta sessão — é o que faz a tela reabrir marcada.
 *
 * Passa pela `highlight_votes_by` (0019), NÃO pela tabela: a RLS não
 * tem select aberto e nunca vai ter. A função vale pelo mesmo nível de
 * confiança do "clique no seu nome" (identity.ts) — sem conta, sem
 * login, que é o que faz o voto caber num toque. O preço está escrito
 * na 0019: ela acredita no id que o cliente manda.
 *
 * Devolve null, NÃO uma lista vazia, quando a leitura falha. Mesmo
 * motivo do `fetchVoters` logo acima: vazio seria lido como "ainda não
 * votei", e a tela abriria o boletim em branco pra quem já votou.
 * Aqui isso custa caro, porque `castVotes` APAGA o voto anterior antes
 * de gravar o novo — informação errada aqui perde o voto da pessoa.
 */
export async function myVotes(
  sessionId: string,
  voterId: string,
): Promise<string[] | null> {
  const { data, error } = await supabase.rpc("highlight_votes_by", {
    p_session_id: sessionId,
    p_voter_id: voterId,
  });
  if (!error && data) return (data as Row[]).map((v) => v.player_id as string);

  // A função é da 0019. Ela pode faltar por dois motivos que a tela não
  // distingue sozinha: a migration não rodou, ou rodou e o cache de
  // schema do PostgREST ainda não viu (`notify pgrst, 'reload schema'`).
  // O aviso vai pro console porque quem cuida do banco é quem consegue
  // agir — o jogador na areia não tem o que fazer com isso.
  console.warn(
    "[destaques] highlight_votes_by falhou:",
    error?.message ?? "sem dados",
  );

  // Plano B: leitura direta. Só passa por quem reivindicou o jogador com
  // uma conta, pela `votes_read_own` da 0018 — mas é melhor que nada.
  const { data: rows, error: tableError } = await supabase
    .from("highlight_votes")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("voter_id", voterId);

  if (tableError) {
    console.warn("[destaques] leitura direta falhou:", tableError.message);
    return null;
  }

  // Vazio aqui NÃO é "não votei": com a 0019 fora do ar, a RLS filtra em
  // silêncio e devolve zero linha do mesmo jeito. Sem as duas leituras
  // funcionando a resposta honesta é "não sei".
  const ids = (rows ?? []).map((v: Row) => v.player_id as string);
  return ids.length ? ids : null;
}

/**
 * Grava (ou troca) o voto de alguém.
 *
 * Passa pela `cast_highlight_votes` (0020), que apaga o voto anterior e
 * grava o novo numa transação só. Trocar o voto em duas viagens era
 * errado de dois jeitos:
 *
 *   • o DELETE ia sem conferir o resultado, e RLS que filtra DELETE não
 *     dá erro — apaga zero linha e devolve 200. O INSERT seguinte
 *     reinseria um nome que já estava lá e batia na unique da 0001
 *     (23505), que é o que a galera via ao tentar trocar;
 *   • se o DELETE passasse e o INSERT falhasse — rede de praia caindo
 *     no meio — a pessoa ficava SEM VOTO NENHUM.
 */
export async function castVotes(
  sessionId: string,
  voterId: string,
  playerIds: string[],
  limit = VOTES_PER_PLAYER,
) {
  const ids = playerIds.slice(0, limit).filter((id) => id !== voterId);

  const { error } = await supabase.rpc("cast_highlight_votes", {
    p_session_id: sessionId,
    p_voter_id: voterId,
    p_player_ids: ids,
  });
  if (!error) return;

  // De propósito não existe plano B em duas viagens aqui. Ele seria o
  // próprio bug que esta função conserta: apagar o voto antigo e falhar
  // no insert deixa a pessoa sem voto nenhum. Sem a transação, a coisa
  // mais segura a fazer é não escrever nada e dizer o que houve — o
  // voto que já estava lá continua de pé.
  console.warn("[destaques] cast_highlight_votes falhou:", error.message);
  throw new Error(
    `Não deu pra salvar seu voto (${error.message}). Se você já tinha votado, o voto anterior continua valendo.`,
  );
}

export type HighlightResult = {
  /** Os destaques, sem ordem de colocação e sem contagem. */
  winners: SessionPlayer[];
  voters: number;
};

/**
 * Resultado da votação.
 *
 * A contagem por jogador é usada só aqui dentro, para achar os três — e
 * nunca sai desta função. Mostrar "Maria 17 · Victor 1" transformaria a
 * brincadeira em competição de popularidade e humilharia quem tirou 1.
 */
export async function fetchHighlights(
  sessionId: string,
  players: SessionPlayer[],
  top = 3,
): Promise<HighlightResult> {
  // passa pelas funções agregadas, NUNCA pela tabela: desde a 0014 o
  // cliente só enxerga o próprio voto, e ler a tabela aqui devolveria
  // "1 voto no total" — resultado errado é pior que resultado ausente
  const [{ data: tallyRows }, { data: voterRows }] = await Promise.all([
    supabase.rpc("highlight_tally", { p_session_id: sessionId }),
    supabase.rpc("highlight_voters", { p_session_id: sessionId }),
  ]);

  const tally = new Map<string, number>(
    ((tallyRows ?? []) as Row[]).map((r) => [
      r.player_id as string,
      Number(r.votes ?? 0),
    ]),
  );
  const voters = new Set(
    ((voterRows ?? []) as Row[]).map((r) => r.voter_id as string),
  );

  const byId = new Map(players.map((p) => [p.id, p]));
  const winners = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([id]) => byId.get(id))
    .filter((p): p is SessionPlayer => Boolean(p))
    // ordem alfabética na tela: sem pódio, sem 1º lugar
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { winners, voters: voters.size };
}

// ── mexer em quem está jogando ───────────────────────────────

/**
 * Troca alguém que está em quadra por alguém da fila.
 *
 * Cobre todos os casos que aparecem na areia:
 *   • sorteado saiu antes de começar → entra outro, ele volta pra fila
 *   • no meio do jogo alguém precisa sair → o substituto assume ali mesmo
 *   • organizador quer só ajustar o time
 *
 * Quem sai NÃO leva jogo nenhum: `games_played` só sobe no fim da
 * partida, então ele volta pra fila exatamente na posição em que estava.
 * Quem entra é que vai contar a partida quando ela for registrada.
 */
export async function swapPlayer(
  matchId: string,
  outPlayerId: string,
  inPlayerId: string,
) {
  // guarda QUEM ele substituiu (0016): sem isso a troca apaga o fato de
  // que alguém entrou no meio, e a regra `tapa_buraco` não teria como
  // existir. O `joined_mid` é decidido na leitura, pela regra da pelada.
  const { error } = await supabase
    .from("match_players")
    .update({
      player_id: inPlayerId,
      joined_mid: true,
      substituted_for: outPlayerId,
      joined_at: iso(),
    })
    .eq("match_id", matchId)
    .eq("player_id", outPlayerId);
  if (error) throw new Error(error.message);
}

/** Passa alguém de um time pro outro, dentro da partida atual. */
export async function movePlayer(matchId: string, playerId: string, team: Team) {
  const { error } = await supabase
    .from("match_players")
    .update({ team })
    .eq("match_id", matchId)
    .eq("player_id", playerId);
  if (error) throw new Error(error.message);
}

/**
 * Foi embora. Sai da fila e, se estava em quadra, o primeiro da fila
 * assume a vaga — o time não fica desfalcado sem ninguém perceber.
 */
export async function leaveSession(
  state: LiveState,
  playerId: string,
  replacementId: string | null,
) {
  const match = state.activeMatch;
  const onCourt = match
    ? [...match.teamA, ...match.teamB].some((p) => p.id === playerId)
    : false;

  if (onCourt && replacementId) {
    await swapPlayer(match!.id, playerId, replacementId);
  }

  await supabase
    .from("session_players")
    .upsert(
      { session_id: state.sessionId, player_id: playerId, excluded: true },
      { onConflict: "session_id,player_id" },
    );

  // se estava segurando a quadra, sai da lista de campeões
  if (state.championIds.includes(playerId)) {
    const next = state.championIds
      .filter((id) => id !== playerId)
      .concat(onCourt && replacementId ? [replacementId] : []);
    await supabase
      .from("sessions")
      .update({ champion_ids: next })
      .eq("id", state.sessionId);
  }
}

/** Voltou. Desfaz o "foi embora". */
export async function rejoinSession(sessionId: string, playerId: string) {
  await supabase
    .from("session_players")
    .upsert(
      {
        session_id: sessionId,
        player_id: playerId,
        excluded: false,
        checked_in_at: iso(),
      },
      { onConflict: "session_id,player_id" },
    );
}

/**
 * O que a tela precisa contar depois do apito.
 *
 * `winnerDissolved` é o caso que parece bug e não é: o time bateu o teto
 * de vitórias, foi desfeito, e QUEM PERDEU segura a quadra.
 */
export type FinishSummary = {
  winner: Team;
  /** Quem continua na quadra — no MESMO lado, com o mesmo nome. */
  staying: SessionPlayer[];
  /** O lado de quem ficou. */
  stayingTeam: Team;
  /** Quem volta pro fim da fila. */
  leaving: SessionPlayer[];
  winnerDissolved: boolean;
  /** Série de quem ficou. Zero quando ficou por ter sobrado. */
  streak: number;
};

export async function finishMatch(
  state: LiveState,
  winner: Team,
  /** Placar, quando alguém marcou ponto a ponto. Sem ele a partida é
      registrada só com o vencedor — que é o caminho normal. */
  score?: { a: number; b: number },
): Promise<FinishSummary | null> {
  const match = state.activeMatch;
  if (!match) return null;

  const at = iso();

  /**
   * Quem entrou no meio, e o que fazer com ele.
   *
   * `titular` (padrão do v1): entrou, é titular — conta o jogo e herda
   * a vaga na quadra.
   * `tapa_buraco`: não conta o jogo (nem a nota), mas continua em
   * quadra; quem saiu é que leva a partida que jogou.
   */
  let notCounted: string[] = [];
  let alsoPlayed: { playerId: string; team: Team }[] = [];

  if (state.settings.substitutionMode === "tapa_buraco") {
    const { data: subs } = await supabase
      .from("match_players")
      .select("player_id, team, substituted_for, joined_mid")
      .eq("match_id", match.id)
      .eq("joined_mid", true);

    const rows = (subs ?? []) as Row[];
    notCounted = rows.map((r) => r.player_id as string);
    alsoPlayed = rows
      .filter((r) => r.substituted_for)
      .map((r) => ({
        playerId: r.substituted_for as string,
        team: r.team as Team,
      }));
  }

  const outcome = applyMatchResult({
    players: state.players,
    teamA: match.teamA,
    teamB: match.teamB,
    winner,
    holderTeam: match.holderTeam,
    championStreak: match.championStreak,
    maxStreak: state.maxStreak,
    notCounted,
    alsoPlayed,
    at,
  });

  const onCourt = new Set([
    ...[...match.teamA, ...match.teamB].map((p) => p.id),
    // quem saiu no meio também teve contador mexido
    ...alsoPlayed.map((s) => s.playerId),
  ]);
  const touched = outcome.players.filter((p) => onCourt.has(p.id));

  // a espera de quem ficou de fora também andou: grava a fila junto
  const waiting = outcome.players.filter(
    (p) => !onCourt.has(p.id) && p.checkedInAt !== null && !p.excluded,
  );

  await supabase.from("session_players").upsert(
    [...touched, ...waiting].map((p) => ({
      session_id: state.sessionId,
      player_id: p.id,
      games_played: p.gamesPlayed,
      last_played_at: p.lastPlayedAt,
      rounds_waiting: p.roundsWaiting,
      checked_in_at: p.checkedInAt,
    })),
    { onConflict: "session_id,player_id" },
  );

  // nota nova de quem jogou (sobe na vitória, desce na derrota).
  // Desde a 0012 ela é DA PELADA: `pelada_members.rating`.
  await Promise.all(
    touched.map((p) =>
      supabase
        .from("pelada_members")
        .update({ rating: p.rating })
        .eq("pelada_id", state.peladaId)
        .eq("player_id", p.id),
    ),
  );

  await supabase
    .from("matches")
    .update({
      status: "finished",
      winner_team: winner,
      finished_at: at,
      ...(score ? { score_a: score.a, score_b: score.b } : {}),
    })
    .eq("id", match.id);

  await supabase
    .from("sessions")
    .update({
      champion_ids: outcome.champion?.playerIds ?? [],
      champion_streak: outcome.champion?.streak ?? 0,
      // o lado de quem ficou: a próxima partida monta o desafiante do
      // outro lado, em vez de renomear o time que já estava lá
      champion_team: outcome.champion?.team ?? null,
    })
    .eq("id", state.sessionId);

  // devolve os jogadores JÁ atualizados (nota e contagem novas), pra
  // tela do "próxima" não mostrar número velho
  const byId = new Map(outcome.players.map((p) => [p.id, p]));
  const staying = (outcome.champion?.playerIds ?? [])
    .map((id) => byId.get(id))
    .filter((p): p is SessionPlayer => Boolean(p));

  return {
    winner,
    staying,
    stayingTeam: outcome.champion?.team ?? winner,
    leaving: outcome.leaving.map((p) => byId.get(p.id) ?? p),
    winnerDissolved: outcome.winnerDissolved,
    streak: outcome.champion?.streak ?? 0,
  };
}

/**
 * A galera trocou de lado — sol, vento, set novo.
 *
 * Troca os dois times de lado E o placar junto (`swap_sides`, migration
 * 0011). É a única forma de um time mudar de nome: por decisão de quem
 * está na quadra, nunca como efeito colateral de ter ganhado.
 */
export async function swapSides(matchId: string) {
  const { error } = await supabase.rpc("swap_sides", { p_match: matchId });
  if (error) throw new Error(error.message);
}
