import type { Team } from "./types";

/**
 * O NOME DOS TIMES — e por que ele deixou de ser "A" e "B".
 *
 * Playtest 01 (§5): o time que segurava a quadra era renomeado a cada
 * partida, porque a rotação assumia "quem fica é sempre o time A". Na
 * areia o time NÃO troca de lado — quem ficou continua no mesmo lado da
 * rede, mas a tela dizia outra letra. Botaram ponto no time errado e o
 * time errado venceu.
 *
 * Duas coisas consertam isso, e as duas são necessárias:
 *
 *   1. a identidade do time passa a ser AMARRADA AO LADO (`rotation.ts`
 *      devolve em qual lado o campeão fica, em vez de forçar o A);
 *   2. o nome deixa de ser uma letra abstrata e vira a cor que a pessoa
 *      está vendo na tela — ninguém confere "A" olhando pra quadra, mas
 *      todo mundo confere "azul".
 *
 * As cores são as do tema (`--color-team-a`, `--color-team-b`) e o nome
 * é configurável por pelada, porque cada grupo chama do seu jeito.
 */
export type TeamLabels = { A: string; B: string };

export const DEFAULT_TEAM_LABELS: TeamLabels = { A: "AZUL", B: "LARANJA" };

export function teamName(team: Team, labels: TeamLabels = DEFAULT_TEAM_LABELS) {
  return labels[team];
}

/** "Time AZUL" — pra frases inteiras ("Time AZUL venceu"). */
export function teamTitle(team: Team, labels: TeamLabels = DEFAULT_TEAM_LABELS) {
  return `Time ${labels[team]}`;
}

export const otherTeam = (team: Team): Team => (team === "A" ? "B" : "A");
