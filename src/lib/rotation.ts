import type { SessionPlayer, Team } from "./types";

/**
 * ROTAÇÃO — regra validada na praia (e no bot do Neto, core.py:421).
 *
 * Vitória normal:
 *   perdedor sai, vencedor fica defendendo a quadra.
 *
 * Vencedor chega a `maxStreak` vitórias seguidas:
 *   o VENCEDOR é desfeito e volta pro fim da fila — já jogou demais.
 *   O PERDEDOR permanece na quadra, com a série zerada, e enfrenta
 *   um time novo.
 *
 * O ponto dessa segunda regra é que **sempre exatamente 6 rotacionam
 * por partida**, nunca 12. A fila anda no mesmo passo a noite inteira,
 * e não trava esperando juntar 12 pessoas de fora.
 *
 * Invariante: quem fica na quadra é sempre o time A da partida seguinte.
 */

export type Champion = {
  playerIds: string[];
  /** Vitórias seguidas. Zero = ficou por ter sobrado, não por ter ganhado. */
  streak: number;
} | null;

/** Quanto a nota sobe na vitória e desce na derrota. Igual ao bot. */
export const RATING_STEP = 0.5;
const clampRating = (v: number) => Math.min(10, Math.max(0, Number(v.toFixed(2))));

export type MatchOutcome = {
  players: SessionPlayer[];
  champion: Champion;
  /** Quem saiu de quadra nesta partida. */
  leaving: SessionPlayer[];
  /** true quando o vencedor bateu o teto e foi desfeito. */
  winnerDissolved: boolean;
};

export function applyMatchResult(input: {
  players: SessionPlayer[];
  teamA: SessionPlayer[];
  teamB: SessionPlayer[];
  winner: Team;
  /** true se o time A entrou nesta partida defendendo a quadra. */
  championStays: boolean;
  /** Vitórias que o time A já tinha ao entrar. */
  championStreak: number;
  maxStreak: number;
  at: string;
}): MatchOutcome {
  const { players, teamA, teamB, winner, championStays, maxStreak, at } = input;

  const winners = winner === "A" ? teamA : teamB;
  const losers = winner === "A" ? teamB : teamA;

  const won = new Set(winners.map((p) => p.id));
  const lost = new Set(losers.map((p) => p.id));

  // Só quem estava em quadra NA HORA de registrar conta a partida.
  // Quem foi substituído antes disso volta pra fila intacto — pra ela
  // é como se nunca tivesse sido sorteada (mesma regra do bot).
  const updated = players.map((p) => {
    if (!won.has(p.id) && !lost.has(p.id)) return p;
    return {
      ...p,
      gamesPlayed: p.gamesPlayed + 1,
      lastPlayedAt: at,
      rating: clampRating(p.rating + (won.has(p.id) ? RATING_STEP : -RATING_STEP)),
    };
  });

  // só continua a série quem já estava defendendo a quadra
  const streak = championStays && winner === "A" ? input.championStreak + 1 : 1;
  const winnerDissolved = streak >= maxStreak;

  // no teto, o vencedor sai e quem perdeu segura a quadra
  const staying = winnerDissolved ? losers : winners;
  const leaving = winnerDissolved ? winners : losers;

  return {
    players: updated,
    champion: {
      playerIds: staying.map((p) => p.id),
      streak: winnerDissolved ? 0 : streak,
    },
    leaving,
    winnerDissolved,
  };
}
