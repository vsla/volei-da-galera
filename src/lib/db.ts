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
  | { ok: false; missing: number; available: number };

export async function generateMatch(
  state: LiveState,
  opts: { locked?: LockedPlayer[]; forceReshuffle?: boolean; nonce?: string } = {},
): Promise<GenerateOutcome> {
  const round = state.round + 1;
  const seed = `${state.sessionId}|${round}|${opts.nonce ?? ""}`;

  const result = generateNextMatch({
    players: state.players,
    teamSize: state.teamSize,
    champion: state.championIds.length
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

  // apaga um rascunho anterior da mesma rodada (re-sorteio)
  await supabase
    .from("matches")
    .delete()
    .eq("session_id", state.sessionId)
    .eq("round", round)
    .eq("status", "active");

  const { data: match } = await supabase
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

  if (!match) return { ok: false, missing: 0, available: 0 };

  await supabase.from("match_players").insert([
    ...result.teamA.map((p) => ({ match_id: match.id, player_id: p.id, team: "A" })),
    ...result.teamB.map((p) => ({ match_id: match.id, player_id: p.id, team: "B" })),
  ]);

  await supabase
    .from("sessions")
    .update({ status: "playing" })
    .eq("id", state.sessionId);

  return { ok: true };
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
