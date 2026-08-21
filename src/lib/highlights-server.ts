/**
 * Leitura dos Destaques no servidor.
 *
 * Não usa o supabase-js de propósito: ele monta um cliente realtime já
 * na importação e o Node sem WebSocket nativo quebra. Aqui só precisamos
 * de leitura, então REST puro resolve e não carrega peso nenhum.
 */

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Chama uma função do banco. É por aqui que os Destaques são lidos: a
 * tabela `highlight_votes` não tem `select` liberado (voto é privado),
 * então quem devolve os nomes é a função agregada `highlight_days`.
 */
async function rpc<T>(
  fn: string,
  args: Record<string, unknown>,
  revalidate = 60,
): Promise<T> {
  if (!URL_BASE || !KEY) return [] as unknown as T;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
      next: { revalidate },
    });
    if (!r.ok) return [] as unknown as T;
    return (await r.json()) as T;
  } catch {
    return [] as unknown as T;
  }
}

/** Uma leitura REST simples — mesma razão do `rpc` acima. */
async function rest<T>(path: string, revalidate = 60): Promise<T | null> {
  if (!URL_BASE || !KEY) return null;
  try {
    const r = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      next: { revalidate },
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export type PeladaInfo = { id: string; name: string; slug: string };

/** A pelada pelo slug da URL — os Destaques agora são de UMA pelada. */
export async function getPelada(slug: string): Promise<PeladaInfo | null> {
  const rows = await rest<PeladaInfo[]>(
    `peladas?slug=eq.${encodeURIComponent(slug)}&select=id,name,slug&limit=1`,
  );
  return rows?.[0] ?? null;
}

type TallyRow = {
  session_id: string;
  played_on: string;
  player_id: string;
  name: string;
  votes: number;
};

/** Agrupa as linhas da função por noite. */
function groupDays(rows: TallyRow[]): HighlightDay[] {
  const byDay = new Map<string, HighlightDay>();
  for (const row of rows) {
    const day = byDay.get(row.session_id) ?? {
      sessionId: row.session_id,
      date: row.played_on,
      winners: [],
      // a função não devolve quantos votaram — e não vai devolver:
      // seria a única informação daqui capaz de identificar votante
      voters: 0,
    };
    day.winners.push({ id: row.player_id, name: row.name });
    byDay.set(row.session_id, day);
  }
  for (const day of byDay.values()) {
    day.winners.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }
  return [...byDay.values()];
}

export type HighlightDay = {
  sessionId: string;
  date: string;
  winners: { id: string; name: string }[];
  voters: number;
};

/** Todas as noites de UMA pelada que já tiveram destaque. */
export async function listHighlightDays(peladaId: string): Promise<HighlightDay[]> {
  return groupDays(
    await rpc<TallyRow[]>("highlight_days_pelada", {
      p_pelada: peladaId,
      p_limit: 60,
    }),
  );
}

/** Os destaques de uma data específica. */
export async function getHighlightDay(
  peladaId: string,
  date: string,
): Promise<HighlightDay | null> {
  const days = await listHighlightDays(peladaId);
  return days.find((d) => d.date === date) ?? null;
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
