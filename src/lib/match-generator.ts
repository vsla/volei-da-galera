import { hashString, mulberry32, randomFor, shuffled } from "./rng";
import type { PastMatch, SessionPlayer, Team } from "./types";

/**
 * GERADOR DE PARTIDAS — função pura, sem UI e sem banco.
 *
 * Duas mecânicas separadas, cada uma explicável em uma frase:
 *
 *   1. QUEM JOGA  → fila determinística: menos jogos, há mais tempo
 *                   sem jogar, e sorteio no empate. Sem pesos mágicos.
 *   2. COM QUEM   → só entre os já escolhidos, minimiza parceiro
 *                   repetido nas últimas rodadas.
 *
 * A justiça nunca é sacrificada pela variedade: a fila decide quem
 * entra, e a otimização só opera dentro do que a fila permitiu.
 */

/** Quantas rodadas passadas contam como "repetiu parceiro". */
const HISTORY_WINDOW = 3;
/** Peso de repetir parceiro vs. repetir adversário. */
const TEAMMATE_WEIGHT = 30;
const OPPONENT_WEIGHT = 10;
/** Divisões aleatórias testadas antes da busca local. */
const CANDIDATES = 300;

export type LockedPlayer = { playerId: string; team: Team };

export type GeneratorInput = {
  /** Todos os jogadores da sessão. Quem não fez check-in é ignorado. */
  players: SessionPlayer[];
  teamSize: number;
  /** Time que está defendendo a quadra, se houver. */
  champion: { playerIds: string[]; streak: number } | null;
  maxStreak: number;
  history: PastMatch[];
  /** Fixados pelo organizador — entram e ficam no time indicado. */
  locked?: LockedPlayer[];
  /** Tirados do sorteio pelo organizador (machucou, foi comer). */
  excluded?: string[];
  /**
   * Ignora o campeão e remonta os dois times do zero.
   *
   * É o "resortear todo mundo" de quando a noite já encheu e os times
   * ficaram viciados. Quem estava esperando há mais tempo entra primeiro,
   * então quem estava na quadra tende a sair — sem regra especial.
   */
  forceReshuffle?: boolean;
  seed: string;
};

export type PickReason = {
  player: SessionPlayer;
  games: number;
  /** Entrou (ou ficou de fora) por sorteio de empate. */
  byTiebreak: boolean;
};

export type Explanation = {
  minGames: number;
  maxGames: number;
  gamesDiff: number;
  /** Pares que já jogaram juntos nas últimas rodadas. */
  repeatedTeammatePairs: number;
  repeatedOpponentPairs: number;
  /** Quem entrou, na ordem da fila. */
  picked: PickReason[];
  /** O primeiro que NÃO entrou. Responde "por que ele e não eu?". */
  firstOut: PickReason | null;
  /** true quando o corte caiu no meio de um empate. */
  tiebreakUsed: boolean;
};

export type GeneratorResult =
  | {
      ok: true;
      /** Quando o campeão fica, ele é sempre o time A. */
      teamA: SessionPlayer[];
      teamB: SessionPlayer[];
      /** Fila, já ordenada. */
      bench: SessionPlayer[];
      championStays: boolean;
      explanation: Explanation;
    }
  | { ok: false; missing: number; available: number };

// ─────────────────────────────────────────────────────────────
// Fila
// ─────────────────────────────────────────────────────────────

function queueKey(p: SessionPlayer): string {
  // nunca jogou vem antes de quem já jogou
  return `${p.gamesPlayed}|${p.lastPlayedAt ?? ""}`;
}

/**
 * Ordena a fila. O terceiro critério é sorteio, não ordem de chegada:
 * com 25 pessoas e 6x6, empate em gamesPlayed é o caso comum. Desempatar
 * por chegada faria quem chega cedo jogar mais a noite inteira — um viés
 * silencioso e cumulativo. Com sorteio, o viés não acumula.
 */
export function orderQueue(
  players: SessionPlayer[],
  seed: string,
): SessionPlayer[] {
  return players.slice().sort((a, b) => {
    if (a.gamesPlayed !== b.gamesPlayed) return a.gamesPlayed - b.gamesPlayed;

    const at = a.lastPlayedAt ? Date.parse(a.lastPlayedAt) : -Infinity;
    const bt = b.lastPlayedAt ? Date.parse(b.lastPlayedAt) : -Infinity;
    if (at !== bt) return at - bt;

    return randomFor(seed, a.id) - randomFor(seed, b.id);
  });
}

// ─────────────────────────────────────────────────────────────
// Histórico
// ─────────────────────────────────────────────────────────────

const pairKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);

type HistoryIndex = { teammates: Map<string, number>; opponents: Map<string, number> };

function indexHistory(history: PastMatch[]): HistoryIndex {
  const teammates = new Map<string, number>();
  const opponents = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const match of history.slice(-HISTORY_WINDOW)) {
    for (const team of [match.teamA, match.teamB]) {
      for (let i = 0; i < team.length; i++)
        for (let j = i + 1; j < team.length; j++)
          bump(teammates, pairKey(team[i], team[j]));
    }
    for (const a of match.teamA)
      for (const b of match.teamB) bump(opponents, pairKey(a, b));
  }

  return { teammates, opponents };
}

/**
 * Escolhe quem entra, resolvendo o empate a favor da variedade.
 *
 * O corte quase sempre cai no meio de um grupo empatado em jogos. Se a
 * gente simplesmente fatiar a fila, o grupo volta em bloco — e o time
 * inteiro de duas rodadas atrás reaparece junto. Entre pessoas EMPATADAS
 * (mesmos jogos, mesmo tempo de espera), preferir quem repete menos não
 * tira a vez de ninguém: todos tinham exatamente o mesmo direito.
 *
 * A justiça continua intocada — só o desempate mudou de sorteio puro
 * para sorteio enviesado contra repetição.
 */
function pickFromQueue(
  queue: SessionPlayer[],
  needed: number,
  idx: HistoryIndex,
  against: SessionPlayer[],
  rand: () => number,
): { picked: SessionPlayer[]; bench: SessionPlayer[] } {
  if (needed <= 0) return { picked: [], bench: queue };

  const boundaryKey = queueKey(queue[needed - 1]);
  const start = queue.findIndex((p) => queueKey(p) === boundaryKey);
  let end = start;
  while (end + 1 < queue.length && queueKey(queue[end + 1]) === boundaryKey) end++;

  // o grupo empatado não cruza o corte: nada a decidir
  if (end < needed) {
    return { picked: queue.slice(0, needed), bench: queue.slice(needed) };
  }

  const certain = queue.slice(0, start);
  const group = queue.slice(start, end + 1);
  const k = needed - certain.length;

  const cost = (sel: SessionPlayer[]) => {
    const all = [...certain, ...sel];
    let hits = 0;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        hits += idx.teammates.get(pairKey(all[i].id, all[j].id)) ?? 0;
    let opp = 0;
    for (const a of all)
      for (const b of against) opp += idx.opponents.get(pairKey(a.id, b.id)) ?? 0;
    return hits * TEAMMATE_WEIGHT + opp * OPPONENT_WEIGHT;
  };

  let bestSel = group.slice(0, k);
  let bestCost = cost(bestSel);
  for (let n = 0; n < CANDIDATES && bestCost > 0; n++) {
    const sel = shuffled(group, rand).slice(0, k);
    const c = cost(sel);
    if (c < bestCost) [bestSel, bestCost] = [sel, c];
  }

  const chosen = new Set(bestSel.map((p) => p.id));
  return {
    picked: certain.concat(group.filter((p) => chosen.has(p.id))),
    // a sobra do grupo volta pra fila na ordem original
    bench: group.filter((p) => !chosen.has(p.id)).concat(queue.slice(end + 1)),
  };
}

function scoreSplit(
  teamA: SessionPlayer[],
  teamB: SessionPlayer[],
  idx: HistoryIndex,
): number {
  let teammateHits = 0;
  for (const team of [teamA, teamB])
    for (let i = 0; i < team.length; i++)
      for (let j = i + 1; j < team.length; j++)
        teammateHits += idx.teammates.get(pairKey(team[i].id, team[j].id)) ?? 0;

  let opponentHits = 0;
  for (const a of teamA)
    for (const b of teamB)
      opponentHits += idx.opponents.get(pairKey(a.id, b.id)) ?? 0;

  return teammateHits * TEAMMATE_WEIGHT + opponentHits * OPPONENT_WEIGHT;
}

/**
 * Repetições que o gerador de fato escolheu.
 *
 * Pares obrigatórios — os 6 do campeão, que ficam juntos por regra, e
 * os fixados pelo organizador — são excluídos da conta. Senão toda
 * rodada de campeão reportaria 15 "parceiros repetidos" e a tela
 * acusaria o algoritmo de uma repetição que é a própria regra do jogo.
 */
function reportRepeats(
  teamA: SessionPlayer[],
  teamB: SessionPlayer[],
  idx: HistoryIndex,
  forced: Set<string>,
): { repeatedTeammatePairs: number; repeatedOpponentPairs: number } {
  let repeatedTeammatePairs = 0;
  for (const team of [teamA, teamB]) {
    for (let i = 0; i < team.length; i++) {
      for (let j = i + 1; j < team.length; j++) {
        const key = pairKey(team[i].id, team[j].id);
        if (forced.has(key)) continue;
        if ((idx.teammates.get(key) ?? 0) > 0) repeatedTeammatePairs++;
      }
    }
  }

  let repeatedOpponentPairs = 0;
  for (const a of teamA)
    for (const b of teamB)
      if ((idx.opponents.get(pairKey(a.id, b.id)) ?? 0) > 0) repeatedOpponentPairs++;

  return { repeatedTeammatePairs, repeatedOpponentPairs };
}

// ─────────────────────────────────────────────────────────────
// Gerador
// ─────────────────────────────────────────────────────────────

export function generateNextMatch(input: GeneratorInput): GeneratorResult {
  const { players, teamSize, champion, maxStreak, history, seed } = input;
  const locked = input.locked ?? [];
  const excluded = new Set(input.excluded ?? []);

  const eligible = players.filter(
    (p) => p.checkedInAt !== null && !p.excluded && !excluded.has(p.id),
  );
  const byId = new Map(eligible.map((p) => [p.id, p]));

  // O campeão só fica enquanto não bateu o teto — e enquanto o
  // organizador não pedir pra remontar tudo.
  const championStays =
    !input.forceReshuffle && champion !== null && champion.streak < maxStreak;

  // ── quem já tem lugar garantido ───────────────────────────
  const preA: SessionPlayer[] = [];
  const preB: SessionPlayer[] = [];
  const taken = new Set<string>();

  const claim = (p: SessionPlayer | undefined, side: SessionPlayer[]) => {
    if (!p || taken.has(p.id) || side.length >= teamSize) return;
    side.push(p);
    taken.add(p.id);
  };

  if (championStays) {
    for (const id of champion.playerIds) claim(byId.get(id), preA);
  }
  for (const l of locked) claim(byId.get(l.playerId), l.team === "A" ? preA : preB);

  // ── fila ──────────────────────────────────────────────────
  const queue = orderQueue(
    eligible.filter((p) => !taken.has(p.id)),
    seed,
  );

  const slotsA = teamSize - preA.length;
  const slotsB = teamSize - preB.length;
  const needed = slotsA + slotsB;

  if (queue.length < needed) {
    return { ok: false, missing: needed - queue.length, available: eligible.length };
  }

  const idx = indexHistory(history);
  const rand = mulberry32(hashString(seed));
  const { picked, bench } = pickFromQueue(queue, needed, idx, preA, rand);

  // ── quem entrou por sorteio de empate ─────────────────────
  // O corte pode cair no meio de um grupo empatado. Marcamos o grupo
  // inteiro para a tela conseguir explicar "por que ele e não eu".
  const boundaryKey = needed > 0 ? queueKey(picked[picked.length - 1]) : "";
  const tiebreakUsed =
    needed > 0 && bench.length > 0 && queueKey(bench[0]) === boundaryKey;
  const inTieGroup = (p: SessionPlayer) => tiebreakUsed && queueKey(p) === boundaryKey;

  // ── divisão em times ──────────────────────────────────────
  let bestA = preA.concat(picked.slice(0, slotsA));
  let bestB = preB.concat(picked.slice(slotsA));
  let bestCost = scoreSplit(bestA, bestB, idx);

  if (slotsA > 0 && slotsB > 0) {
    for (let n = 0; n < CANDIDATES && bestCost > 0; n++) {
      const mix = shuffled(picked, rand);
      const a = preA.concat(mix.slice(0, slotsA));
      const b = preB.concat(mix.slice(slotsA));
      const c = scoreSplit(a, b, idx);
      if (c < bestCost) [bestA, bestB, bestCost] = [a, b, c];
    }

    // busca local: troca pares até não melhorar mais
    for (let pass = 0; pass < 50 && bestCost > 0; pass++) {
      let improved = false;
      for (let i = preA.length; i < bestA.length; i++) {
        for (let j = preB.length; j < bestB.length; j++) {
          const a = bestA.slice();
          const b = bestB.slice();
          [a[i], b[j]] = [b[j], a[i]];
          const c = scoreSplit(a, b, idx);
          if (c < bestCost) {
            [bestA, bestB, bestCost] = [a, b, c];
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  }

  // pares que ficaram juntos por regra, não por escolha do gerador
  const forcedPairs = new Set<string>();
  for (const side of [preA, preB])
    for (let i = 0; i < side.length; i++)
      for (let j = i + 1; j < side.length; j++)
        forcedPairs.add(pairKey(side[i].id, side[j].id));

  const repeats = reportRepeats(bestA, bestB, idx, forcedPairs);

  const onCourt = [...bestA, ...bestB];
  const games = onCourt.map((p) => p.gamesPlayed);

  return {
    ok: true,
    teamA: bestA,
    teamB: bestB,
    bench,
    championStays,
    explanation: {
      minGames: Math.min(...games),
      maxGames: Math.max(...games),
      gamesDiff: Math.max(...games) - Math.min(...games),
      repeatedTeammatePairs: repeats.repeatedTeammatePairs,
      repeatedOpponentPairs: repeats.repeatedOpponentPairs,
      picked: picked.map((p) => ({
        player: p,
        games: p.gamesPlayed,
        byTiebreak: inTieGroup(p),
      })),
      firstOut: bench.length
        ? {
            player: bench[0],
            games: bench[0].gamesPlayed,
            byTiebreak: inTieGroup(bench[0]),
          }
        : null,
      tiebreakUsed,
    },
  };
}
