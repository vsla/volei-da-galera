import { supabase } from "./supabase";
import { generateNextMatch, type LockedPlayer } from "./match-generator";
import { applyMatchResult } from "./rotation";
import type { PastMatch, SessionPlayer, Team } from "./types";

/** Estado inteiro da noite. Uma leitura só, pra tela nunca ficar meio pronta. */
export type LiveState = {
  sessionId: string;
  date: string;
  status: "open" | "playing" | "voting" | "closed";
  teamSize: number;
  maxStreak: number;
  championIds: string[];
  championStreak: number;
  /** Todos os jogadores cadastrados, com os dados da noite. */
  players: SessionPlayer[];
  activeMatch: {
    id: string;
    round: number;
    championStays: boolean;
    championStreak: number;
    teamA: SessionPlayer[];
    teamB: SessionPlayer[];
  } | null;
  history: PastMatch[];
  round: number;
};

type Row = Record<string, unknown>;

const iso = () => new Date().toISOString();

export async function fetchState(): Promise<LiveState | null> {
  const { data: sessions } = await supabase
    .from("sessions")
    .select("*")
    .order("date", { ascending: false })
    .limit(1);

  const session = sessions?.[0] as Row | undefined;
  if (!session) return null;
  const sessionId = session.id as string;

  const [{ data: players }, { data: sps }, { data: matches }] = await Promise.all([
    supabase.from("players").select("*").order("name"),
    supabase.from("session_players").select("*").eq("session_id", sessionId),
    supabase
      .from("matches")
      .select("*, match_players(*)")
      .eq("session_id", sessionId)
      .order("round", { ascending: false })
      .limit(6),
  ]);

  const byPlayer = new Map(
    (sps ?? []).map((s: Row) => [s.player_id as string, s]),
  );

  const merged: SessionPlayer[] = (players ?? []).map((p: Row) => {
    const s = byPlayer.get(p.id as string);
    return {
      id: p.id as string,
      name: p.name as string,
      avatarUrl: (p.avatar_url as string) ?? null,
      isGuest: Boolean(p.is_guest),
      rating: Number(p.rating ?? 5),
      checkedInAt: (s?.checked_in_at as string) ?? null,
      gamesPlayed: (s?.games_played as number) ?? 0,
      lastPlayedAt: (s?.last_played_at as string) ?? null,
      excluded: Boolean(s?.excluded),
    };
  });

  const byId = new Map(merged.map((p) => [p.id, p]));
  const rows = (matches ?? []) as Row[];
  const active = rows.find((m) => m.status === "active");

  const teamOf = (m: Row, team: Team) =>
    ((m.match_players as Row[]) ?? [])
      .filter((mp) => mp.team === team)
      .map((mp) => byId.get(mp.player_id as string))
      .filter((p): p is SessionPlayer => Boolean(p));

  const history: PastMatch[] = rows
    .filter((m) => m.status === "finished")
    .sort((a, b) => (a.round as number) - (b.round as number))
    .map((m) => ({
      round: m.round as number,
      teamA: teamOf(m, "A").map((p) => p.id),
      teamB: teamOf(m, "B").map((p) => p.id),
    }));

  return {
    sessionId,
    date: session.date as string,
    status: session.status as LiveState["status"],
    teamSize: session.team_size as number,
    maxStreak: session.max_streak as number,
    championIds: (session.champion_ids as string[]) ?? [],
    championStreak: (session.champion_streak as number) ?? 0,
    players: merged,
    activeMatch: active
      ? {
          id: active.id as string,
          round: active.round as number,
          championStays: Boolean(active.champion_stays),
          championStreak: (active.champion_streak as number) ?? 0,
          teamA: teamOf(active, "A"),
          teamB: teamOf(active, "B"),
        }
      : null,
    history,
    round: rows.length ? Math.max(...rows.map((m) => m.round as number)) : 0,
  };
}

// ─────────────────────────────────────────────────────────────

export async function checkIn(sessionId: string, playerId: string) {
  await supabase
    .from("session_players")
    .upsert(
      { session_id: sessionId, player_id: playerId, checked_in_at: iso() },
      { onConflict: "session_id,player_id" },
    );
}

export async function undoCheckIn(sessionId: string, playerId: string) {
  await supabase
    .from("session_players")
    .update({ checked_in_at: null })
    .eq("session_id", sessionId)
    .eq("player_id", playerId);
}

export async function addGuest(name: string): Promise<string | null> {
  const { data } = await supabase
    .from("players")
    .insert({ name: name.trim(), is_guest: true })
    .select("id")
    .single();
  return (data?.id as string) ?? null;
}

/** Reabre a noite: zera contadores e limpa a quadra. */
export async function openSession(sessionId: string) {
  await supabase.from("sessions").update({ status: "open" }).eq("id", sessionId);
}

export async function setSessionConfig(
  sessionId: string,
  patch: { teamSize?: number; maxStreak?: number },
) {
  const body: Row = {};
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
  // coluna nova: migration 0002 ainda não rodou no projeto
  if (/champion_stays|champion_ids|column/i.test(raw)) {
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
        ? { playerIds: state.championIds, streak: state.championStreak }
        : null,
    maxStreak: state.maxStreak,
    history: state.history,
    locked: opts.locked,
    forceReshuffle: opts.forceReshuffle,
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
        champion_streak: state.championStreak,
        seed,
        winner_team: null,
        finished_at: null,
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
      champion_streak: state.championStreak,
      seed,
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

// ── Destaques do Dia ─────────────────────────────────────────

/** Quantos cada um pode escolher. */
export const VOTES_PER_PLAYER = 3;

export async function openVoting(sessionId: string) {
  await supabase.from("sessions").update({ status: "voting" }).eq("id", sessionId);
}

export async function closeVoting(sessionId: string) {
  await supabase.from("sessions").update({ status: "closed" }).eq("id", sessionId);
}

export async function myVotes(sessionId: string, voterId: string): Promise<string[]> {
  const { data } = await supabase
    .from("highlight_votes")
    .select("player_id")
    .eq("session_id", sessionId)
    .eq("voter_id", voterId);
  return (data ?? []).map((v: Row) => v.player_id as string);
}

export async function castVotes(
  sessionId: string,
  voterId: string,
  playerIds: string[],
) {
  await supabase
    .from("highlight_votes")
    .delete()
    .eq("session_id", sessionId)
    .eq("voter_id", voterId);

  const rows = playerIds
    .slice(0, VOTES_PER_PLAYER)
    .filter((id) => id !== voterId)
    .map((id) => ({ session_id: sessionId, voter_id: voterId, player_id: id }));

  if (rows.length) {
    const { error } = await supabase.from("highlight_votes").insert(rows);
    if (error) throw new Error(error.message);
  }
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
  const { data } = await supabase
    .from("highlight_votes")
    .select("voter_id, player_id")
    .eq("session_id", sessionId);

  const rows = (data ?? []) as Row[];
  const tally = new Map<string, number>();
  const voters = new Set<string>();

  for (const r of rows) {
    const pid = r.player_id as string;
    tally.set(pid, (tally.get(pid) ?? 0) + 1);
    voters.add(r.voter_id as string);
  }

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
  const { error } = await supabase
    .from("match_players")
    .update({ player_id: inPlayerId })
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

export async function finishMatch(state: LiveState, winner: Team) {
  const match = state.activeMatch;
  if (!match) return;

  const at = iso();
  const outcome = applyMatchResult({
    players: state.players,
    teamA: match.teamA,
    teamB: match.teamB,
    winner,
    championStays: match.championStays,
    championStreak: match.championStreak,
    maxStreak: state.maxStreak,
    at,
  });

  const onCourt = new Set([...match.teamA, ...match.teamB].map((p) => p.id));
  const touched = outcome.players.filter((p) => onCourt.has(p.id));

  await supabase.from("session_players").upsert(
    touched.map((p) => ({
      session_id: state.sessionId,
      player_id: p.id,
      games_played: p.gamesPlayed,
      last_played_at: p.lastPlayedAt,
      checked_in_at: p.checkedInAt,
    })),
    { onConflict: "session_id,player_id" },
  );

  // nota nova de quem jogou (sobe na vitória, desce na derrota)
  await Promise.all(
    touched.map((p) =>
      supabase.from("players").update({ rating: p.rating }).eq("id", p.id),
    ),
  );

  await supabase
    .from("matches")
    .update({ status: "finished", winner_team: winner, finished_at: at })
    .eq("id", match.id);

  await supabase
    .from("sessions")
    .update({
      champion_ids: outcome.champion?.playerIds ?? [],
      champion_streak: outcome.champion?.streak ?? 0,
    })
    .eq("id", state.sessionId);
}
