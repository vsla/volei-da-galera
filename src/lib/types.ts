export type Team = "A" | "B";

export type SessionStatus = "open" | "playing" | "voting" | "closed";

export type Player = {
  id: string;
  name: string;
  avatarUrl: string | null;
  isGuest: boolean;
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
