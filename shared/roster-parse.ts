/**
 * A LISTA DO WHATSAPP VIRA NOMES.
 *
 * Puro de propósito: sem banco, sem tela, sem rede. É a peça que mais
 * erra do v3 — cada lista chega com uma sujeira diferente — e a única
 * que dá pra verificar de graça, com as listas reais como fixture
 * (`roster-parse.test.ts`).
 *
 * O que ele NÃO faz, e não é esquecimento:
 *
 *   • não lê o `✅`. Na lista do grupo aquilo é pix pago, não presença.
 *     Ninguém entra com check-in feito — cada um toca "EU CHEGUEI" na
 *     praia;
 *   • não decide quem entrou primeiro. A lista chega decidida do grupo;
 *   • não grava nada. Quem grava é o painel, depois da prévia.
 */

/** Um nome lido da lista. `isGuest` é palpite, não cadastro. */
export type ParsedName = { name: string; isGuest: boolean };

/**
 * Invisíveis que o WhatsApp enfia no meio da linha.
 *
 * O U+2060 (*word joiner*) é o pior deles: o teclado do iOS o coloca
 * entre o ponto da numeração e o nome, ele não ocupa espaço nenhum na
 * tela, e quebra qualquer `split(". ")` ingênuo — a linha parece
 * `10. Nickole` e é `10.⁠ ⁠Nickole`.
 */
const INVISIVEIS = /[​-‍⁠﻿᠎]/g;

/** Espaços que não são o espaço normal (nbsp, espaço estreito, tab). */
const ESPACOS = /[\t    ]/g;

/**
 * Numeração no começo da linha: `1.`, `2)`, `10 - `, `03.`.
 *
 * O `-` e o `:` só valem com espaço depois, e é isso que segura o
 * cabeçalho: `21-23h30` seria "numeração 21" com a regra frouxa, e a
 * linha do horário viraria um jogador chamado `23h30 | 18,34 pra cada`.
 *
 * É aplicada em laço, não uma vez: a lista de 11/09 chegou com
 * `1.⁠ ⁠⁠1. Miguel` — o organizador colou por cima da
 * própria numeração. Uma passada só deixaria o nome como "1. Miguel".
 */
const NUMERACAO = /^\s*\d{1,3}\s*(?:[.)]|[-–—:][ ])\s*/;

/**
 * Símbolo colado na ponta do nome: `✅`, `🏐`, `👍`, e o seletor de
 * variação que vem junto. Come também o `-` ou `–` que às vezes sobra
 * antes do símbolo (`Vinicius Lamarck - ✅`).
 */
const SIMBOLO_FIM =
  /[\s\-\u2013\u2014]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u2705\u2714\uFE0F\u20E3])+[\s\-\u2013\u2014]*$/u;
const SIMBOLO_INICIO =
  /^[\s\-\u2013\u2014\u2022*]*(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u2705\u2714\uFE0F\u20E3])+[\s\-\u2013\u2014]*/u;

/** Tira acento e caixa. É a chave de "esse nome já está na lista?". */
export function chaveDeNome(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Nome entre parênteses é convidado — `Guilherme (Lê)`, `Mucio
 * (Vitória)`.
 *
 * É a convenção do grupo: quem está entre parênteses é o anfitrião, não
 * um sobrenome. Fica DENTRO do nome, não vira coluna: é assim que
 * procuram na tela, e é o que separa dois `Guilherme`.
 */
function ehConvidado(name: string): boolean {
  return /\([^)]*\)\s*$/.test(name);
}

function limpaLinha(linha: string): string {
  let s = linha.replace(INVISIVEIS, "").replace(ESPACOS, " ");
  s = s.replace(SIMBOLO_INICIO, "").replace(SIMBOLO_FIM, "");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Lê o bloco colado do WhatsApp e devolve os nomes, na ordem da lista.
 *
 * O cabeçalho sai por posição, não por conteúdo: **linha sem numeração
 * e antes da primeira linha numerada é cabeçalho**. Vale pra
 * `Vôlei Sexta 11/09`, pro `21-23h30`, pro `Pix: ...` e pro telefone
 * sem precisar adivinhar o formato de nenhum deles.
 *
 * Depois da primeira linha numerada, linha sem número é NOME — é o
 * "o Arthur vai também" que alguém mandou solto no fim da lista.
 *
 * Se a lista vier inteira sem numeração, toda linha não-vazia é nome,
 * cabeçalho incluso. É de propósito: a prévia do painel mostra o que
 * entrou antes de gravar, e chutar quais linhas são "cabeçalho de
 * verdade" erraria nomes curtos como `Caio`.
 */
export function parseRoster(text: string): ParsedName[] {
  const linhas = text.split(/\r?\n/);
  const primeiraNumerada = linhas.findIndex((l) =>
    NUMERACAO.test(l.replace(INVISIVEIS, "").replace(ESPACOS, " ")),
  );

  const nomes: ParsedName[] = [];
  const vistos = new Set<string>();

  linhas.forEach((linha, i) => {
    if (primeiraNumerada >= 0 && i < primeiraNumerada) return;

    let s = limpaLinha(linha);
    if (!s) return;

    // o laço é o conserto do `1. 1. Miguel`
    let antes: string;
    do {
      antes = s;
      s = s.replace(NUMERACAO, "").trim();
    } while (s !== antes);

    s = limpaLinha(s);
    if (!s) return;

    const chave = chaveDeNome(s);
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);

    nomes.push({ name: s, isGuest: ehConvidado(s) });
  });

  return nomes;
}

/**
 * O que a prévia mostra: entram, ficam, saem.
 *
 * Puro também, e é aqui que mora a trava do §1 — quem organiza nunca
 * sai, mesmo fora da lista colada. Pelada sem organizador não tem
 * conserto pela tela (a lição da 0017), e o preço de manter um nome a
 * mais na tela é baixo perto disso.
 */
export type Diff = {
  entram: ParsedName[];
  ficam: { playerId: string; name: string }[];
  saem: { playerId: string; name: string }[];
};

export function diffRoster(
  lista: ParsedName[],
  membros: {
    playerId: string;
    name: string;
    role: string;
    status: string;
  }[],
): Diff {
  const porChave = new Map(
    membros
      .filter((m) => m.status !== "removed")
      .map((m) => [chaveDeNome(m.name), m]),
  );
  const naLista = new Set(lista.map((n) => chaveDeNome(n.name)));

  const entram = lista.filter((n) => !porChave.has(chaveDeNome(n.name)));
  const ficam: Diff["ficam"] = [];
  const saem: Diff["saem"] = [];

  for (const m of porChave.values()) {
    const protegido = m.role === "owner" || m.role === "admin";
    if (naLista.has(chaveDeNome(m.name)) || protegido) {
      ficam.push({ playerId: m.playerId, name: m.name });
    } else {
      saem.push({ playerId: m.playerId, name: m.name });
    }
  }

  return { entram, ficam, saem };
}
