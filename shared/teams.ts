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
 *   2. o nome deixa de ser uma letra abstrata e vira algo que dá pra
 *      CONFERIR OLHANDO PRA QUADRA.
 *
 * A primeira versão do (2) escolheu a cor do tema, com o argumento de
 * que "ninguém confere 'A' olhando pra quadra, mas todo mundo confere
 * azul". Na areia isso não se sustentou: ninguém veste azul. A cor
 * responde *em que time eu estou*, e a pergunta de doze pessoas em pé
 * depois do sorteio é outra — *de que lado eu fico*.
 *
 * Então o nome é o LADO ("MAR", "RUA", o que existir naquela quadra). É
 * o único identificador que não depende de ter visto a rodada anterior:
 * vale a noite inteira, porque `team A` já É um lado fixo desde a 0011 e
 * `swap_sides` move as pessoas em vez de renomear os times.
 *
 * A cor do tema (`--color-team-a`, `--color-team-b`) continua, mas como
 * pintura — a faixa do card e o número do placar —, não como nome. O
 * nome é configurável por pelada porque só o grupo sabe o que existe
 * dos dois lados da rede dele.
 */
export type TeamLabels = { A: string; B: string };

export const DEFAULT_TEAM_LABELS: TeamLabels = { A: "AZUL", B: "LARANJA" };

/**
 * Sugestões de um toque no painel.
 *
 * Existem porque ninguém abre configuração pra digitar duas palavras: o
 * caminho tem que ser tocar, não escrever. A ordem é proposital — o par
 * que funciona em qualquer quadra de praia vem primeiro, e as cores
 * ficam por último como volta atrás, não como ponto de partida.
 */
export const SIDE_SUGGESTIONS: TeamLabels[] = [
  { A: "MAR", B: "RUA" },
  { A: "QUIOSQUE", B: "POSTE" },
  { A: "AZUL", B: "LARANJA" },
];

export function teamName(team: Team, labels: TeamLabels = DEFAULT_TEAM_LABELS) {
  return labels[team];
}

/** "Time AZUL" — pra frases inteiras ("Time AZUL venceu"). */
export function teamTitle(team: Team, labels: TeamLabels = DEFAULT_TEAM_LABELS) {
  return `Time ${labels[team]}`;
}

export const otherTeam = (team: Team): Team => (team === "A" ? "B" : "A");
