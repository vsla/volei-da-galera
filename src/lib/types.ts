export type Team = "A" | "B";

export type SessionStatus = "open" | "playing" | "voting" | "closed";

export type Player = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isGuest: boolean;
  /** 0..10, começa em 5, ±0.5 por partida. Igual ao bot. */
  rating: number;
};

/** Jogador dentro de uma sessão: check-in e contadores da noite. */
export type SessionPlayer = Player & {
  checkedInAt: string | null;
  gamesPlayed: number;
  lastPlayedAt: string | null;
  excluded: boolean;
};

export type Session = {
  id: string;
  date: string;
  status: SessionStatus;
  teamSize: number;
  maxStreak: number;
};

export type Match = {
  id: string;
  sessionId: string;
  round: number;
  status: "active" | "finished";
  winnerTeam: Team | null;
  championStreak: number;
  teamA: SessionPlayer[];
  teamB: SessionPlayer[];
};

/** Uma rodada passada, para o gerador evitar repetir parceiros. */
export type PastMatch = {
  round: number;
  teamA: string[];
  teamB: string[];
};

/** Iniciais para o avatar: "Maria Gabrielly" → "MG", "Neto" → "NE" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** "Maria Gabrielly" → "MARIA" — a quadra só tem espaço pro primeiro nome. */
export function shortName(name: string): string {
  return name.trim().split(/\s+/)[0].toUpperCase();
}

/**
 * Nomes curtos para a quadra, desambiguados.
 *
 * O grupo tem "João" e "João Victor": os dois virariam "JOÃO" e ninguém
 * saberia quem está em qual time. Quando há colisão, quem tem sobrenome
 * ganha a inicial ("JOÃO V.") e quem não tem fica só com o primeiro nome.
 */
export function courtNames(players: { id: string; name: string }[]): Map<string, string> {
  const groups = new Map<string, { id: string; name: string }[]>();
  for (const p of players) {
    const first = shortName(p.name);
    groups.set(first, [...(groups.get(first) ?? []), p]);
  }

  const out = new Map<string, string>();
  for (const [first, group] of groups) {
    if (group.length === 1) {
      out.set(group[0].id, first);
      continue;
    }
    for (const p of group) {
      const rest = p.name.trim().split(/\s+/).slice(1);
      out.set(p.id, rest.length ? `${first} ${rest[0][0].toUpperCase()}.` : first);
    }
  }
  return out;
}
