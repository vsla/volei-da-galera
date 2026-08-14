import type { SessionPlayer } from "./types";

export const NAMES = [
  "Miguel", "Vinícius Lamarck", "Amanda Lavs", "Arthur Farias",
  "Maria Gabrielly", "Suzana Rodrigues", "Pedro Augusto", "Brenda Dias",
  "Ewerton", "Lenin Pastichi", "Álvaro Gabriel", "Ítalo Thiago",
  "Leandro", "João Victor", "Mateus", "Guilherme",
  "Victor", "João", "Alisson", "Brenno",
  "Neto", "Fefa", "Baca", "Bia", "Tali",
];

export function player(
  id: string,
  over: Partial<SessionPlayer> = {},
): SessionPlayer {
  return {
    id,
    name: id,
    avatarUrl: null,
    isGuest: false,
    rating: 5,
    checkedInAt: "2026-08-14T19:00:00Z",
    gamesPlayed: 0,
    lastPlayedAt: null,
    excluded: false,
    ...over,
  };
}

/** 25 jogadores com check-in feito e zero jogos. */
export function roster(n = NAMES.length): SessionPlayer[] {
  return NAMES.slice(0, n).map((name) => player(name));
}
