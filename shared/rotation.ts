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
 * ── O LADO (mudou no playtest 01) ────────────────────────────
 *
 * Antes valia a invariante "quem fica na quadra é sempre o time A da
 * partida seguinte". Era cômodo pro gerador e péssimo na areia: o time
 * não troca de lado da rede, mas a tela renomeava ele a cada partida.
 * Marcaram ponto no time errado e o time errado venceu.
 *
 * Agora quem fica **mantém o lado**: `champion.team` diz em qual lado o
 * grupo está, e o desafiante entra no lado oposto. Trocar de lado passa
 * a ser uma AÇÃO explícita do organizador (quando a galera troca de lado
 * de verdade), nunca um efeito colateral de ter ganhado.
 */

export type Champion = {
  playerIds: string[];
  /** Vitórias seguidas. Zero = ficou por ter sobrado, não por ter ganhado. */
  streak: number;
  /** Em qual lado da quadra esse grupo está. */
  team: Team;
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
  /**
   * Qual lado entrou nesta partida defendendo a quadra — `null` quando
   * a partida foi montada do zero (rodada nova, rebalanceamento).
   */
  holderTeam: Team | null;
  /** Vitórias que o time da casa já tinha ao entrar. */
  championStreak: number;
  maxStreak: number;
  /**
   * Entraram DEPOIS do apito e, pela regra da pelada
   * (`substitutionMode: "tapa_buraco"`), não contam esta partida.
   *
   * Eles continuam em quadra — se o time ficar, ficam junto. É o pedido
   * literal do playtest: "deveria não contar e continuar, daí ele
   * sairia na próxima".
   */
  notCounted?: string[];
  /**
   * Saíram no meio, mas a partida foi deles: contam o jogo e a nota
   * pelo time em que estavam. Sem isso, quem jogou 90% do set sairia da
   * partida sem nada — e voltaria pra fila na frente de todo mundo.
   */
  alsoPlayed?: { playerId: string; team: Team }[];
  at: string;
}): MatchOutcome {
  const { players, teamA, teamB, winner, holderTeam, maxStreak, at } = input;

  const winners = winner === "A" ? teamA : teamB;
  const losers = winner === "A" ? teamB : teamA;

  const skip = new Set(input.notCounted ?? []);
  const won = new Set(winners.filter((p) => !skip.has(p.id)).map((p) => p.id));
  const lost = new Set(losers.filter((p) => !skip.has(p.id)).map((p) => p.id));

  for (const extra of input.alsoPlayed ?? []) {
    (extra.team === winner ? won : lost).add(extra.playerId);
  }

  // Só quem estava em quadra NA HORA de registrar conta a partida.
  // Quem foi substituído antes disso volta pra fila intacto — pra ela
  // é como se nunca tivesse sido sorteada (mesma regra do bot).
  //
  // A espera anda aqui, não na hora do sorteio: quem foi sorteado e
  // substituído antes do apito não perde a vez que tinha acumulado.
  const updated = players.map((p) => {
    if (won.has(p.id) || lost.has(p.id)) {
      return {
        ...p,
        gamesPlayed: p.gamesPlayed + 1,
        lastPlayedAt: at,
        roundsWaiting: 0,
        rating: clampRating(p.rating + (won.has(p.id) ? RATING_STEP : -RATING_STEP)),
      };
    }
    // tapa-buraco: estava em quadra, então não conta a partida NEM
    // acumula espera. Ele nem jogou de verdade, nem ficou esperando.
    if (skip.has(p.id)) return p;
    // quem estava esperando de fato — não conta quem nem fez check-in
    // nem quem saiu da noite
    if (p.checkedInAt === null || p.excluded) return p;
    return { ...p, roundsWaiting: p.roundsWaiting + 1 };
  });

  // só continua a série quem já estava defendendo a quadra
  const streak = holderTeam === winner ? input.championStreak + 1 : 1;
  const winnerDissolved = streak >= maxStreak;

  // no teto, o vencedor sai e quem perdeu segura a quadra
  const staying = winnerDissolved ? losers : winners;
  const leaving = winnerDissolved ? winners : losers;
  // e o lado é o lado de quem ficou — não muda porque alguém ganhou
  const stayingTeam: Team = winnerDissolved
    ? winner === "A"
      ? "B"
      : "A"
    : winner;

  return {
    players: updated,
    champion: {
      playerIds: staying.map((p) => p.id),
      streak: winnerDissolved ? 0 : streak,
      team: stayingTeam,
    },
    leaving,
    winnerDissolved,
  };
}
