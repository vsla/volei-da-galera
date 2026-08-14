/**
 * Simulador da noite. `npm run simulate`
 *
 * É como se prova pra galera que o sorteio é justo — mesma coisa que o
 * bot do Telegram já fez, mas agora dá pra rodar antes de ir pra praia.
 */

import { generateNextMatch } from "../src/lib/match-generator";
import { applyMatchResult, type Champion } from "../src/lib/rotation";
import { roster } from "../src/lib/test-helpers";
import type { PastMatch } from "../src/lib/types";

const ROUNDS = Number(process.argv[2] ?? 20);
const PLAYERS = Number(process.argv[3] ?? 25);
const TEAM_SIZE = Number(process.argv[4] ?? 6);
const MAX_STREAK = Number(process.argv[5] ?? 2);

let players = roster(PLAYERS);
let champion: Champion = null;
let championStreak = 0;
const history: PastMatch[] = [];
const together = new Map<string, number>();
let falls = 0;

const pairKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`);

console.log(
  `\n🏐 ${PLAYERS} jogadores · ${TEAM_SIZE}x${TEAM_SIZE} · cai em ${MAX_STREAK} vitórias · ${ROUNDS} rodadas\n`,
);

for (let round = 1; round <= ROUNDS; round++) {
  const r = generateNextMatch({
    players,
    teamSize: TEAM_SIZE,
    champion,
    maxStreak: MAX_STREAK,
    history,
    seed: `sim|${round}`,
  });

  if (!r.ok) {
    console.log(`rodada ${round}: faltaram ${r.missing} jogadores. parou aqui.`);
    break;
  }

  const idsA = r.teamA.map((p) => p.id);
  const idsB = r.teamB.map((p) => p.id);
  history.push({ round, teamA: idsA, teamB: idsB });

  for (const team of [idsA, idsB])
    for (let i = 0; i < team.length; i++)
      for (let j = i + 1; j < team.length; j++) {
        const k = pairKey(team[i], team[j]);
        together.set(k, (together.get(k) ?? 0) + 1);
      }

  const winner = round % 3 === 0 ? "B" : "A";
  const applied = applyMatchResult({
    players,
    teamA: r.teamA,
    teamB: r.teamB,
    winner,
    championStays: r.championStays,
    championStreak,
    maxStreak: MAX_STREAK,
    at: new Date(Date.UTC(2026, 7, 14, 19, round * 12)).toISOString(),
  });

  if (applied.winnerDissolved) falls++;
  players = applied.players;
  champion = applied.champion;
  championStreak = applied.champion?.streak ?? 0;

  const mark = r.championStays ? "🔥" : "🎲";
  console.log(
    `${String(round).padStart(2)} ${mark} ` +
      `${idsA.map((n) => n.split(" ")[0]).join(", ").padEnd(46)} vs ` +
      `${idsB.map((n) => n.split(" ")[0]).join(", ").padEnd(46)} ` +
      `→ ${winner}  (repetidos: ${r.explanation.repeatedTeammatePairs})`,
  );
}

// ── resultado ────────────────────────────────────────────────
const games = players.map((p) => p.gamesPlayed);
const min = Math.min(...games);
const max = Math.max(...games);

console.log(`\n⚖️  DISTRIBUIÇÃO\n`);
for (const p of [...players].sort((a, b) => b.gamesPlayed - a.gamesPlayed)) {
  const bar = "█".repeat(p.gamesPlayed);
  console.log(`  ${p.name.padEnd(18)} ${String(p.gamesPlayed).padStart(2)} ${bar}`);
}

const repeats = [...together.values()];
const maxTogether = repeats.length ? Math.max(...repeats) : 0;
const avgTogether = repeats.length
  ? repeats.reduce((a, b) => a + b, 0) / repeats.length
  : 0;

console.log(`
  mais jogos:        ${max}
  menos jogos:       ${min}
  diferença:         ${max - min}   ${max - min <= 2 ? "✅" : "❌ acima de 2"}
  vencedor desfeito: ${falls}
  dupla mais repetida: ${maxTogether}x  ·  média por dupla: ${avgTogether.toFixed(2)}x
`);
