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
/**
 * Peso por ponto de diferença de força entre os times.
 *
 * A nota NUNCA muda quem entra: a fila decide isso sozinha. Ela só age
 * onde não há escolha a fazer em termos de justiça — no empate e na
 * divisão dos times. Por isso o peso pode ser alto sem risco.
 */
const BALANCE_WEIGHT = 20;

/**
 * A NOTA NÃO FURA A FILA — nem por um jogo.
 *
 * O bot do Neto tem uma "janela" (`PESO_JOGOS_EXTRA`, core.py:31) que
 * alcança quem está um jogo à frente quando isso equilibra melhor a
 * partida. A gente testou e tirou: significa alguém que já jogou 4
 * entrar no lugar de alguém que jogou 2, e justiça é a única coisa que
 * a galera confere de cabeça. Uma partida desequilibrada acaba em 15
 * minutos; um "ele jogou mais que eu e entrou na minha frente" dura a
 * noite toda.
 *
 * O equilíbrio age onde não custa a vez de ninguém: entre os EMPATADOS
 * em número de jogos. Com 25 pessoas e 6x6, esse grupo é grande quase
 * sempre — é ali que a nota escolhe quem casa melhor com a força de
 * quem está na quadra.
 */
/** Folga do pool de candidatos, pra não explodir a combinatória. */
const POOL_SLACK = 8;
/** Acima disso, desiste da busca exata e volta pro sorteio de candidatos. */
const MAX_COMBOS = 20000;

/** Quantas combinações de `k` em `n` — saturando, pra não estourar. */
function countCombos(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let out = 1;
  for (let i = 0; i < k; i++) {
    out = (out * (n - i)) / (i + 1);
    if (out > MAX_COMBOS) return Infinity;
  }
  return Math.round(out);
}

/** Todas as combinações de `k` elementos de `items`. */
function* combinations<T>(items: T[], k: number): Generator<T[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > items.length) return;
  for (;;) {
    yield idx.map((i) => items[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === items.length - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

const sumRating = (ps: SessionPlayer[]) => ps.reduce((t, p) => t + p.rating, 0);
/** Divisões aleatórias testadas antes da busca local. */
const CANDIDATES = 300;

export type LockedPlayer = { playerId: string; team: Team };

export type GeneratorInput = {
  /** Todos os jogadores da sessão. Quem não fez check-in é ignorado. */
  players: SessionPlayer[];
  teamSize: number;
  /**
   * Time que está defendendo a quadra, se houver.
   *
   * `team` é o LADO em que esse grupo está. Ele não muda porque o grupo
   * ganhou (playtest 01 §5): quem fica, fica no mesmo lado da rede, e o
   * desafiante entra no lado oposto.
   */
  champion: { playerIds: string[]; streak: number; team: Team } | null;
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
  /**
   * Teto de espera: quem está fora há `waitCap` rodadas entra na
   * próxima, na frente dos empatados. `null`/ausente desliga.
   *
   * Playtest 01 §11: "acharam meio estranho alguns ficarem 3 rodadas
   * fora". É consequência honesta da fila — quem jogou menos entra
   * antes —, mas nada impede um teto, DESDE QUE ele fure só o
   * desempate. Furar a contagem de jogos seria a "janela" que o
   * `reasonable.md` §5 tirou de propósito: alguém com 4 jogos passando
   * na frente de quem tem 2.
   */
  waitCap?: number | null;
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
  /** Soma de nota de cada time e a diferença entre elas. */
  ratingA: number;
  ratingB: number;
  ratingDiff: number;
  /** Quem entrou, na ordem da fila. */
  picked: PickReason[];
  /** O primeiro que NÃO entrou. Responde "por que ele e não eu?". */
  firstOut: PickReason | null;
  /** true quando o corte caiu no meio de um empate. */
  tiebreakUsed: boolean;
  /**
   * Quantas pessoas entraram com mais jogos que o corte da fila.
   * Tem que ser SEMPRE zero — é uma trava viva contra regressão, não
   * um número pra mostrar.
   */
  extraGamesUsed: number;
};

export type GeneratorResult =
  | {
      ok: true;
      teamA: SessionPlayer[];
      teamB: SessionPlayer[];
      /** Fila, já ordenada. */
      bench: SessionPlayer[];
      championStays: boolean;
      /** Em qual lado ficou quem estava segurando a quadra. */
      holderTeam: Team | null;
      explanation: Explanation;
    }
  | { ok: false; missing: number; available: number };

// ─────────────────────────────────────────────────────────────
// Fila
// ─────────────────────────────────────────────────────────────

function queueKey(p: SessionPlayer): string {
  // nunca jogou vem antes de quem já jogou
  return `${p.gamesPlayed}|${p.roundsWaiting}|${p.lastPlayedAt ?? ""}`;
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

    // quem está fora há mais rodadas vem antes
    if (a.roundsWaiting !== b.roundsWaiting) return b.roundsWaiting - a.roundsWaiting;

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
  waitCap?: number | null,
): { picked: SessionPlayer[]; bench: SessionPlayer[] } {
  if (needed <= 0) return { picked: [], bench: queue };

  // fronteira = quantos jogos tem o último que caberia pelo corte seco.
  // Quem tem MENOS jogos que isso entra sempre; quem tem mais, nunca.
  const fronteira = queue[needed - 1].gamesPlayed;
  const certain = queue.filter((p) => p.gamesPlayed < fronteira);
  let tier = queue.filter((p) => p.gamesPlayed === fronteira);

  let k = needed - certain.length;
  if (k <= 0) {
    return { picked: queue.slice(0, needed), bench: queue.slice(needed) };
  }

  /**
   * Teto de espera: quem estourou entra antes dos empatados.
   *
   * Note ONDE isto age — dentro do `tier`, o grupo que tem exatamente os
   * mesmos jogos. Ninguém perde a vez pra isso: o equilíbrio e a
   * variedade é que passam a escolher entre os que sobraram.
   */
  const forced: SessionPlayer[] = [];
  if (waitCap && waitCap > 0) {
    for (const p of tier) {
      if (forced.length >= k) break;
      if (p.roundsWaiting >= waitCap) forced.push(p);
    }
    if (forced.length) {
      const ids = new Set(forced.map((p) => p.id));
      tier = tier.filter((p) => !ids.has(p.id));
      k -= forced.length;
    }
  }

  if (k <= 0) {
    const chosen = new Set([...certain, ...forced].map((p) => p.id));
    return {
      picked: queue.filter((p) => chosen.has(p.id)),
      bench: queue.filter((p) => !chosen.has(p.id)),
    };
  }

  // o pool já vem na ordem da fila, então cortar a cauda descarta
  // primeiro quem tem menos direito
  const pool = tier.slice(0, k + POOL_SLACK);
  const rank = new Map(queue.map((p, i) => [p.id, i]));

  const cost = (sel: SessionPlayer[]): [number, number] => {
    // quem entrou por direito (menos jogos) e quem entrou pelo teto de
    // espera já estão dentro: o custo é da ESCOLHA que ainda resta
    const all = [...certain, ...forced, ...sel];
    let hits = 0;
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        hits += idx.teammates.get(pairKey(all[i].id, all[j].id)) ?? 0;
    let opp = 0;
    for (const a of all)
      for (const b of against) opp += idx.opponents.get(pairKey(a.id, b.id)) ?? 0;
    // com o campeão na quadra, é aqui que a nota consegue equilibrar:
    // escolher o grupo que melhor casa com a força dele
    const imbalance = against.length
      ? Math.abs(sumRating(all) - sumRating(against))
      : 0;
    const main =
      hits * TEAMMATE_WEIGHT + opp * OPPONENT_WEIGHT + imbalance * BALANCE_WEIGHT;
    // empate no custo: fica com quem esperou mais
    const priority = sel.reduce((t, p) => t + (rank.get(p.id) ?? 0), 0);
    return [main, priority];
  };

  const better = (a: [number, number], b: [number, number]) =>
    a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];

  let bestSel = pool.slice(0, k);
  let bestCost = cost(bestSel);

  if (countCombos(pool.length, k) <= MAX_COMBOS) {
    // busca exata — é o que o bot faz, e nesse tamanho cabe
    for (const sel of combinations(pool, k)) {
      const c = cost(sel);
      if (better(c, bestCost)) [bestSel, bestCost] = [sel, c];
    }
  } else {
    // time grande demais: cai no sorteio de candidatos
    for (let n = 0; n < CANDIDATES && bestCost[0] > 0; n++) {
      const sel = shuffled(pool, rand).slice(0, k);
      const c = cost(sel);
      if (better(c, bestCost)) [bestSel, bestCost] = [sel, c];
    }
  }

  const chosen = new Set([...forced, ...bestSel].map((p) => p.id));
  return {
    picked: certain.concat(queue.filter((p) => chosen.has(p.id))),
    bench: queue.filter((p) => p.gamesPlayed >= fronteira && !chosen.has(p.id)),
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

  const imbalance = Math.abs(sumRating(teamA) - sumRating(teamB));

  return (
    teammateHits * TEAMMATE_WEIGHT +
    opponentHits * OPPONENT_WEIGHT +
    imbalance * BALANCE_WEIGHT
  );
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

  // quem segura a quadra fica no MESMO lado — a letra do time não muda
  // porque o grupo ganhou (playtest 01 §5)
  const holderTeam: Team | null = championStays ? champion.team : null;
  const holderSide = holderTeam === "B" ? preB : preA;

  if (championStays) {
    for (const id of champion.playerIds) claim(byId.get(id), holderSide);
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
  // o equilíbrio mira em quem já está na quadra, seja qual for o lado
  const { picked, bench } = pickFromQueue(
    queue,
    needed,
    idx,
    holderSide,
    rand,
    input.waitCap,
  );

  // ── quem entrou por sorteio de empate ─────────────────────
  // O corte pode cair no meio de um grupo empatado. Marcamos o grupo
  // inteiro para a tela conseguir explicar "por que ele e não eu".
  const boundaryKey = needed > 0 ? queueKey(picked[picked.length - 1]) : "";
  const tiebreakUsed =
    needed > 0 && bench.length > 0 && queueKey(bench[0]) === boundaryKey;
  const inTieGroup = (p: SessionPlayer) => tiebreakUsed && queueKey(p) === boundaryKey;

  // trava viva: nenhum escolhido pode ter mais jogos que o corte
  const cut = needed > 0 ? queue[needed - 1].gamesPlayed : 0;
  const extraGamesUsed = picked.filter((p) => p.gamesPlayed > cut).length;

  // ── divisão em times ──────────────────────────────────────
  let bestA = preA.concat(picked.slice(0, slotsA));
  let bestB = preB.concat(picked.slice(slotsA));
  let bestCost = scoreSplit(bestA, bestB, idx);

  if (slotsA > 0 && slotsB > 0) {
    if (countCombos(picked.length, slotsA) <= MAX_COMBOS) {
      // 12 pessoas em 6x6 dá 924 divisões: dá pra testar todas e ficar
      // com a melhor de verdade, em vez da melhor de 300 sorteadas
      const pickedIds = new Set<string>();
      for (const sel of combinations(picked, slotsA)) {
        pickedIds.clear();
        for (const p of sel) pickedIds.add(p.id);
        const a = preA.concat(sel);
        const b = preB.concat(picked.filter((p) => !pickedIds.has(p.id)));
        const c = scoreSplit(a, b, idx);
        if (c < bestCost) [bestA, bestB, bestCost] = [a, b, c];
      }
    } else {
      for (let n = 0; n < CANDIDATES && bestCost > 0; n++) {
        const mix = shuffled(picked, rand);
        const a = preA.concat(mix.slice(0, slotsA));
        const b = preB.concat(mix.slice(slotsA));
        const c = scoreSplit(a, b, idx);
        if (c < bestCost) [bestA, bestB, bestCost] = [a, b, c];
      }
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
    holderTeam,
    explanation: {
      minGames: Math.min(...games),
      maxGames: Math.max(...games),
      gamesDiff: Math.max(...games) - Math.min(...games),
      repeatedTeammatePairs: repeats.repeatedTeammatePairs,
      repeatedOpponentPairs: repeats.repeatedOpponentPairs,
      ratingA: Number(sumRating(bestA).toFixed(1)),
      ratingB: Number(sumRating(bestB).toFixed(1)),
      ratingDiff: Number(Math.abs(sumRating(bestA) - sumRating(bestB)).toFixed(1)),
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
      extraGamesUsed,
    },
  };
}
