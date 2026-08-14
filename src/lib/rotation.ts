import type { SessionPlayer, Team } from "./types";

/**
 * ROTAÇÃO — vencedor fica, e cai depois de `maxStreak` vitórias seguidas.
 *
 * Invariante: quando o campeão fica, ele é sempre o time A da partida
 * seguinte. Isso mantém "quem está defendendo a quadra" num só lugar.
 *
 * O perdedor volta pra fila e cai naturalmente pro fim, porque acabou
 * de somar +1 jogo. Não existe regra especial pra isso.
 */

export type Champion = { playerIds: string[]; streak: number } | null;

export function applyMatchResult(input: {
  players: SessionPlayer[];
  teamA: SessionPlayer[];
  teamB: SessionPlayer[];
  winner: Team;
  /** true se o time A entrou nesta partida como campeão. */
  championStays: boolean;
  championStreak: number;
  maxStreak: number;
  at: string;
}): { players: SessionPlayer[]; champion: Champion; championFell: boolean } {
  const { players, teamA, teamB, winner, championStays, maxStreak, at } = input;

  const onCourt = new Set([...teamA, ...teamB].map((p) => p.id));
  const updated = players.map((p) =>
    onCourt.has(p.id)
      ? { ...p, gamesPlayed: p.gamesPlayed + 1, lastPlayedAt: at }
      : p,
  );

  const winners = winner === "A" ? teamA : teamB;
  const streak = championStays && winner === "A" ? input.championStreak + 1 : 1;
  const championFell = streak >= maxStreak;

  return {
    players: updated,
    champion: championFell
      ? null
      : { playerIds: winners.map((p) => p.id), streak },
    championFell,
  };
}
