import { describe, expect, it } from "vitest";
import { chaveDeNome, diffRoster, parseRoster } from "./roster-parse";

/**
 * As fixtures são as DUAS LISTAS REAIS — 04/09 e 11/09 — remontadas a
 * partir do que o repositório guardou delas: os nomes e a ordem saem de
 * `supabase/roster_2026_09_04.sql` e `roster_2026_09_11.sql`, e as
 * sujeiras (o `⁠` do iOS, o `1. 1.` duplicado da primeira linha, os
 * `✅` de pix pago, o cabeçalho) saem do cabeçalho dos mesmos arquivos
 * e do `PRP-V3.md`.
 *
 * Vale dizer o que isso NÃO é: o texto colado no WhatsApp não foi
 * guardado byte a byte em lugar nenhum do repositório. Se aparecer uma
 * sujeira nova numa sexta, ela entra aqui como caso novo — é pra isso
 * que a §9.3 do PRP quer guardar o `rosterRaw`.
 */

/** U+2060, word joiner — o que o teclado do iOS enfia depois do ponto. */
const WJ = "⁠";

const LISTA_11_09 = [
  "Vôlei Sexta 11/09| Prainha ZN",
  "21-23h30 | 18,34 pra cada",
  "Pix: 81984453412 - Lênin Pastichi",
  "",
  ` 1.${WJ} ${WJ}${WJ}1. Miguel`,
  ` 2.${WJ} ${WJ}Suzana Rodrigues`,
  ` 3.${WJ} ${WJ}João`,
  ` 4.${WJ} ${WJ}Arthur Farias`,
  ` 5.${WJ} ${WJ}Talisson Mendes`,
  ` 6.${WJ} ${WJ}Vitor Attar`,
  ` 7.${WJ} ${WJ}Vinicius Lamarck ✅`,
  ` 8.${WJ} ${WJ}Thiago`,
  ` 9.${WJ} ${WJ}Ewerton Eduardo`,
  `10.${WJ} ${WJ}Álvaro Gabriel`,
  `11.${WJ} ${WJ}Nickole`,
  `12.${WJ} ${WJ}Lênin Pastichi`,
  `13.${WJ} ${WJ}Ítalo Thiago`,
  `14.${WJ} ${WJ}Guilherme (Lê)`,
  `15.${WJ} ${WJ}Anthony (Lê)`,
  "",
].join("\n");

const LISTA_04_09 = [
  "Vôlei Sexta 24/09 | Prainha ZN",
  "21h às 23h30 | R$ 18,34 pra cada",
  "Pix: 81984453412 (Lênin Pastichi)",
  "",
  " 1. Antonella Carvalho ✅",
  " 2. Victor Alves",
  " 3. Neto Araujo",
  " 4. Matheus Paiva ✅",
  " 5. Ewerton Eduardo",
  " 6. Pedro Augusto",
  " 7. Talisson",
  " 8. Suzana Rodrigues ✅",
  " 9. Vitória",
  "10. Fernanda",
  "11. Lênin Pastichi",
  "12. Caio",
  "13. Álvaro Gabriel",
  "14. Vinicius Lamarck",
  "15. Ítalo Thiago",
  "16. Miguel",
  "17. Vitor Attar",
  "18. Lauren (Alv)",
  "19. João Bernardo (Ito)",
  "20. Mucio (Vitória)",
  "21. Guilherme (Lê)",
  "22. Anthony (Lê)",
  "23. Luizinho (Brenda)",
].join("\n");

describe("parseRoster — as listas reais", () => {
  it("11/09: 15 nomes, 13 habituais e 2 convidados", () => {
    const nomes = parseRoster(LISTA_11_09);
    expect(nomes).toHaveLength(15);
    expect(nomes.filter((n) => n.isGuest)).toHaveLength(2);
    expect(nomes.filter((n) => !n.isGuest)).toHaveLength(13);
  });

  it("11/09: a ordem e os nomes são os do grupo", () => {
    expect(parseRoster(LISTA_11_09).map((n) => n.name)).toEqual([
      "Miguel",
      "Suzana Rodrigues",
      "João",
      "Arthur Farias",
      "Talisson Mendes",
      "Vitor Attar",
      "Vinicius Lamarck",
      "Thiago",
      "Ewerton Eduardo",
      "Álvaro Gabriel",
      "Nickole",
      "Lênin Pastichi",
      "Ítalo Thiago",
      "Guilherme (Lê)",
      "Anthony (Lê)",
    ]);
  });

  it("04/09: 23 nomes, 17 habituais e 6 convidados", () => {
    const nomes = parseRoster(LISTA_04_09);
    expect(nomes).toHaveLength(23);
    expect(nomes.filter((n) => !n.isGuest)).toHaveLength(17);
    expect(nomes.filter((n) => n.isGuest)).toHaveLength(6);
  });

  it("04/09: convidado é quem tem o anfitrião entre parênteses", () => {
    const convidados = parseRoster(LISTA_04_09)
      .filter((n) => n.isGuest)
      .map((n) => n.name);
    expect(convidados).toEqual([
      "Lauren (Alv)",
      "João Bernardo (Ito)",
      "Mucio (Vitória)",
      "Guilherme (Lê)",
      "Anthony (Lê)",
      "Luizinho (Brenda)",
    ]);
  });
});

describe("parseRoster — a sujeira que chega junto", () => {
  it("o cabeçalho não vira jogador", () => {
    const nomes = parseRoster(LISTA_11_09).map((n) => n.name);
    expect(nomes.some((n) => /pix/i.test(n))).toBe(false);
    expect(nomes.some((n) => /23h30|18,34|Prainha/i.test(n))).toBe(false);
  });

  it("o horário 21-23h30 não é 'jogador 21'", () => {
    // a armadilha do `-` sem espaço: numeração frouxa leria "21-" como
    // numeração e criaria um nome a partir do resto da linha
    expect(parseRoster("21-23h30 | 18,34 pra cada\n1. Miguel")).toEqual([
      { name: "Miguel", isGuest: false },
    ]);
  });

  it("a numeração dobrada da primeira linha cai inteira", () => {
    expect(parseRoster(` 1.${WJ} ${WJ}${WJ}1. Miguel`)).toEqual([
      { name: "Miguel", isGuest: false },
    ]);
  });

  it("o ✅ é pix pago, não presença — e some do nome", () => {
    expect(parseRoster("1. Vinicius Lamarck ✅")[0].name).toBe(
      "Vinicius Lamarck",
    );
    expect(parseRoster("1. Matheus Paiva  ✅ ")[0].name).toBe("Matheus Paiva");
    expect(parseRoster("1. Talisson - ✅")[0].name).toBe("Talisson");
  });

  it("linha vazia e espaço dobrado não viram nome", () => {
    expect(parseRoster("1. Miguel\n\n\n2.   Suzana   Rodrigues")).toEqual([
      { name: "Miguel", isGuest: false },
      { name: "Suzana Rodrigues", isGuest: false },
    ]);
  });

  it("o mesmo nome duas vezes entra uma vez só", () => {
    expect(parseRoster("1. Miguel\n2. miguel\n3. Míguel")).toHaveLength(1);
  });

  it("nome sem número depois da lista é nome, não cabeçalho", () => {
    // "o Arthur vai hoje", mandado solto no fim
    expect(parseRoster("1. Miguel\nArthur Farias").map((n) => n.name)).toEqual([
      "Miguel",
      "Arthur Farias",
    ]);
  });

  it("lista sem numeração nenhuma: toda linha é nome", () => {
    expect(parseRoster("Miguel\nSuzana Rodrigues")).toHaveLength(2);
  });

  it("texto vazio não explode", () => {
    expect(parseRoster("")).toEqual([]);
    expect(parseRoster("\n\n   \n")).toEqual([]);
  });
});

describe("chaveDeNome", () => {
  it("ignora acento e caixa — 'Lenin' acha 'Lênin'", () => {
    expect(chaveDeNome("Lenin Pastichi")).toBe(chaveDeNome("Lênin Pastichi"));
    expect(chaveDeNome("ÍTALO THIAGO")).toBe(chaveDeNome("Ítalo Thiago"));
  });

  it("não colapsa dois convidados de anfitriões diferentes", () => {
    expect(chaveDeNome("Guilherme (Lê)")).not.toBe(chaveDeNome("Guilherme (Ito)"));
  });
});

describe("diffRoster", () => {
  const membros = [
    { playerId: "p1", name: "Miguel", role: "player", status: "active" },
    { playerId: "p2", name: "Lênin Pastichi", role: "owner", status: "active" },
    { playerId: "p3", name: "Antonella Carvalho", role: "player", status: "active" },
    { playerId: "p4", name: "Caio", role: "player", status: "removed" },
  ];

  it("entram, ficam e saem, contra a lista colada", () => {
    const d = diffRoster(parseRoster("1. Miguel\n2. Arthur Farias"), membros);
    expect(d.entram.map((n) => n.name)).toEqual(["Arthur Farias"]);
    expect(d.ficam.map((m) => m.name).sort()).toEqual([
      "Lênin Pastichi",
      "Miguel",
    ]);
    expect(d.saem.map((m) => m.name)).toEqual(["Antonella Carvalho"]);
  });

  it("quem organiza nunca sai, mesmo fora da lista", () => {
    const d = diffRoster(parseRoster("1. Miguel"), membros);
    expect(d.saem.map((m) => m.name)).not.toContain("Lênin Pastichi");
    expect(d.ficam.map((m) => m.name)).toContain("Lênin Pastichi");
  });

  it("quem já estava removido não conta como quem sai de novo", () => {
    const d = diffRoster(parseRoster("1. Miguel"), membros);
    expect(d.saem.map((m) => m.name)).not.toContain("Caio");
  });

  it("nome sem acento na lista acha quem está com acento no banco", () => {
    const d = diffRoster(parseRoster("1. Lenin Pastichi"), membros);
    expect(d.entram).toEqual([]);
  });
});
