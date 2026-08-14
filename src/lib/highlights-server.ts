/**
 * Leitura dos Destaques no servidor.
 *
 * Não usa o supabase-js de propósito: ele monta um cliente realtime já
 * na importação e o Node sem WebSocket nativo quebra. Aqui só precisamos
 * de leitura, então REST puro resolve e não carrega peso nenhum.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function rest<T>(path: string, revalidate = 60): Promise<T> {
  if (!URL_BASE || !KEY) return [] as unknown as T;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      next: { revalidate },
    });
    if (!r.ok) return [] as unknown as T;
    return (await r.json()) as T;
  } catch {
    return [] as unknown as T;
  }
}

export type HighlightDay = {
  sessionId: string;
  date: string;
  winners: { id: string; name: string }[];
  voters: number;
};

type SessionRow = { id: string; date: string; status: string };
type VoteRow = { session_id: string; voter_id: string; player_id: string };
type PlayerRow = { id: string; name: string };

/**
 * Apura os três destaques de cada noite.
 *
 * A contagem por jogador existe só aqui dentro e nunca sai daqui. Os
 * nomes saem em ordem alfabética — sem pódio, sem primeiro lugar.
 */
function tally(
  votes: VoteRow[],
  players: Map<string, PlayerRow>,
  top = 3,
): { winners: { id: string; name: string }[]; voters: number } {
  const counts = new Map<string, number>();
  const voters = new Set<string>();

  for (const v of votes) {
    counts.set(v.player_id, (counts.get(v.player_id) ?? 0) + 1);
    voters.add(v.voter_id);
  }

  const winners = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([id]) => players.get(id))
    .filter((p): p is PlayerRow => Boolean(p))
    .map((p) => ({ id: p.id, name: p.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { winners, voters: voters.size };
}

/** Todas as noites que já tiveram destaque, da mais recente pra mais antiga. */
export async function listHighlightDays(): Promise<HighlightDay[]> {
  const sessions = await rest<SessionRow[]>(
    "sessions?select=id,date,status&order=date.desc&limit=60",
  );
  if (!sessions.length) return [];

  const ids = sessions.map((s) => s.id);
  const [votes, players] = await Promise.all([
    rest<VoteRow[]>(
      `highlight_votes?select=session_id,voter_id,player_id&session_id=in.(${ids.join(",")})`,
    ),
    rest<PlayerRow[]>("players?select=id,name"),
  ]);

  const byPlayer = new Map(players.map((p) => [p.id, p]));
  const bySession = new Map<string, VoteRow[]>();
  for (const v of votes) {
    bySession.set(v.session_id, [...(bySession.get(v.session_id) ?? []), v]);
  }

  return sessions
    .map((s) => ({ session: s, votes: bySession.get(s.id) ?? [] }))
    .filter(({ votes }) => votes.length > 0)
    .map(({ session, votes }) => ({
      sessionId: session.id,
      date: session.date,
      ...tally(votes, byPlayer),
    }));
}

/** Os destaques de uma data específica. */
export async function getHighlightDay(date: string): Promise<HighlightDay | null> {
  const sessions = await rest<SessionRow[]>(
    `sessions?select=id,date,status&date=eq.${date}&limit=1`,
  );
  const session = sessions[0];
  if (!session) return null;

  const [votes, players] = await Promise.all([
    rest<VoteRow[]>(
      `highlight_votes?select=session_id,voter_id,player_id&session_id=eq.${session.id}`,
    ),
    rest<PlayerRow[]>("players?select=id,name"),
  ]);

  return {
    sessionId: session.id,
    date: session.date,
    ...tally(votes, new Map(players.map((p) => [p.id, p]))),
  };
}

/**
 * "Sexta-feira, 14 de agosto de 2026"
 *
 * Só a primeira letra sobe. CSS `capitalize` (e o equivalente no satori)
 * maiusculiza toda palavra e produz "14 De Agosto De 2026".
 */
export function longDate(date: string): string {
  const s = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}
