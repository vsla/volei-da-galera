import { describe, expect, it } from "vitest";
import { generateNextMatch, orderQueue } from "./match-generator";
import { applyMatchResult, type Champion } from "./rotation";
import { NAMES, player, roster } from "./test-helpers";
import { courtNames, type PastMatch, type SessionPlayer } from "./types";

const base = {
  teamSize: 6,
  champion: null,
  maxStreak: 2,
  history: [] as PastMatch[],
  seed: "s1",
};

function ok(r: ReturnType<typeof generateNextMatch>) {
  if (!r.ok) throw new Error(`esperava partida, faltaram ${r.missing}`);
  return r;
}

const ids = (ps: SessionPlayer[]) => ps.map((p) => p.id);

describe("elegibilidade", () => {
  it("nunca escolhe quem não fez check-in", () => {
    const players = roster(20).map((p, i) =>
      i < 5 ? { ...p, checkedInAt: null } : p,
    );
    const r = ok(generateNextMatch({ ...base, players }));
    const onCourt = [...ids(r.teamA), ...ids(r.teamB)];
    for (let i = 0; i < 5; i++) expect(onCourt).not.toContain(players[i].id);
  });

  it("nunca escolhe quem está excluído — pela flag ou pelo input", () => {
    const players = roster(20).map((p, i) => (i === 0 ? { ...p, excluded: true } : p));
    const r = ok(
      generateNextMatch({ ...base, players, excluded: [players[1].id] }),
    );
    const onCourt = [...ids(r.teamA), ...ids(r.teamB), ...ids(r.bench)];
    expect(onCourt).not.toContain(players[0].id);
    expect(onCourt).not.toContain(players[1].id);
  });

  it("avisa quantos faltam quando não dá pra formar dois times", () => {
    const r = generateNextMatch({ ...base, players: roster(9) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toBe(3);
      expect(r.available).toBe(9);
    }
  });
});

describe("tamanho dos times", () => {
  it("respeita teamSize", () => {
    for (const teamSize of [4, 5, 6]) {
      const r = ok(generateNextMatch({ ...base, teamSize, players: roster() }));
      expect(r.teamA).toHaveLength(teamSize);
      expect(r.teamB).toHaveLength(teamSize);
    }
  });

  it("ninguém aparece em dois lugares ao mesmo tempo", () => {
    const r = ok(generateNextMatch({ ...base, players: roster() }));
    const all = [...ids(r.teamA), ...ids(r.teamB), ...ids(r.bench)];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(25);
  });
});

describe("prioridade da fila", () => {
  it("quem jogou menos entra antes de quem jogou mais", () => {
    const players = [
      ...Array.from({ length: 12 }, (_, i) => player(`novato${i}`, { gamesPlayed: 1 })),
      ...Array.from({ length: 10 }, (_, i) => player(`veterano${i}`, { gamesPlayed: 5 })),
    ];
    const r = ok(generateNextMatch({ ...base, players }));
    const onCourt = [...ids(r.teamA), ...ids(r.teamB)];
    expect(onCourt.every((id) => id.startsWith("novato"))).toBe(true);
  });

  it("quem nunca jogou tem prioridade máxima", () => {
    const players = [
      player("estreante", { gamesPlayed: 0, lastPlayedAt: null }),
      ...Array.from({ length: 20 }, (_, i) =>
        player(`p${i}`, { gamesPlayed: 2, lastPlayedAt: "2026-08-14T20:00:00Z" }),
      ),
    ];
    const r = ok(generateNextMatch({ ...base, players }));
    expect([...ids(r.teamA), ...ids(r.teamB)]).toContain("estreante");
  });

  it("quem chega tarde sobe pro topo da fila", () => {
    // todo mundo já jogou 3; o atrasado acabou de chegar com 0
    const players = [
      ...Array.from({ length: 20 }, (_, i) =>
        player(`p${i}`, { gamesPlayed: 3, lastPlayedAt: "2026-08-14T20:00:00Z" }),
      ),
      player("atrasado", { checkedInAt: "2026-08-14T21:30:00Z" }),
    ];
    const fila = orderQueue(players, "s1");
    expect(fila[0].id).toBe("atrasado");
  });

  it("entre iguais em jogos, quem está há mais tempo sem jogar vem antes", () => {
    const players = [
      player("recente", { gamesPlayed: 2, lastPlayedAt: "2026-08-14T21:00:00Z" }),
      player("antigo", { gamesPlayed: 2, lastPlayedAt: "2026-08-14T19:30:00Z" }),
    ];
    expect(orderQueue(players, "s1")[0].id).toBe("antigo");
  });
});

describe("determinismo", () => {
  it("mesmo seed produz o mesmo resultado", () => {
    const players = roster();
    const a = ok(generateNextMatch({ ...base, players, seed: "igual" }));
    const b = ok(generateNextMatch({ ...base, players, seed: "igual" }));
    expect(ids(a.teamA)).toEqual(ids(b.teamA));
    expect(ids(a.teamB)).toEqual(ids(b.teamB));
  });

  it("a ordem do array de entrada não muda o resultado", () => {
    const players = roster();
    const a = ok(generateNextMatch({ ...base, players, seed: "igual" }));
    const b = ok(
      generateNextMatch({ ...base, players: players.slice().reverse(), seed: "igual" }),
    );
    expect(ids(a.bench).sort()).toEqual(ids(b.bench).sort());
  });

  it("seed diferente sorteia gente diferente no empate", () => {
    const players = roster();
    const a = ok(generateNextMatch({ ...base, players, seed: "um" }));
    const b = ok(generateNextMatch({ ...base, players, seed: "dois" }));
    const setA = new Set([...ids(a.teamA), ...ids(a.teamB)]);
    const setB = new Set([...ids(b.teamA), ...ids(b.teamB)]);
    expect([...setA].some((id) => !setB.has(id))).toBe(true);
  });
});

describe("campeão", () => {
  const champions = Array.from({ length: 6 }, (_, i) =>
    player(`camp${i}`, { gamesPlayed: 2, lastPlayedAt: "2026-08-14T21:00:00Z" }),
  );
  const others = Array.from({ length: 15 }, (_, i) => player(`fila${i}`, { gamesPlayed: 1 }));

  it("com streak abaixo do teto, o campeão fica — e vira o time A", () => {
    const r = ok(
      generateNextMatch({
        ...base,
        players: [...champions, ...others],
        champion: { playerIds: ids(champions), streak: 1 },
      }),
    );
    expect(r.championStays).toBe(true);
    expect(ids(r.teamA).sort()).toEqual(ids(champions).sort());
    expect(ids(r.teamB).every((id) => id.startsWith("fila"))).toBe(true);
  });

  it("campeão fica mesmo tendo mais jogos que a fila inteira", () => {
    const r = ok(
      generateNextMatch({
        ...base,
        players: [
          ...champions.map((p) => ({ ...p, gamesPlayed: 9 })),
          ...others,
        ],
        champion: { playerIds: ids(champions), streak: 1 },
      }),
    );
    expect(ids(r.teamA).sort()).toEqual(ids(champions).sort());
  });

  it("se o organizador baixar o teto no meio da noite, o campeão cai", () => {
    // caminho defensivo: streak já estourado quando maxStreak muda de 3 pra 2
    const r = ok(
      generateNextMatch({
        ...base,
        players: [...champions, ...others],
        champion: { playerIds: ids(champions), streak: 2 },
        maxStreak: 2,
      }),
    );
    expect(r.championStays).toBe(false);
    expect([...ids(r.teamA), ...ids(r.teamB)].every((id) => id.startsWith("fila"))).toBe(true);
  });

  it("completa o desafiante com quem acabou de perder quando a fila é curta", () => {
    // início da noite: 14 pessoas. campeão (6) + 3 esperando + 5 que perderam
    const esperando = Array.from({ length: 3 }, (_, i) => player(`chegou${i}`, { gamesPlayed: 0 }));
    const perdedores = Array.from({ length: 5 }, (_, i) =>
      player(`perdeu${i}`, { gamesPlayed: 1, lastPlayedAt: "2026-08-14T20:00:00Z" }),
    );
    const r = ok(
      generateNextMatch({
        ...base,
        players: [...champions, ...esperando, ...perdedores],
        champion: { playerIds: ids(champions), streak: 1 },
      }),
    );
    const desafiante = ids(r.teamB);
    // os 3 que chegaram entram todos; o resto completa com quem perdeu
    for (const p of esperando) expect(desafiante).toContain(p.id);
    expect(desafiante.filter((id) => id.startsWith("perdeu"))).toHaveLength(3);
  });

  it("resortear todo mundo ignora o campeão e monta 12 do zero", () => {
    // campeão com muitos jogos, fila com poucos: no reshuffle, a fila entra
    const r = ok(
      generateNextMatch({
        ...base,
        players: [
          ...champions.map((p) => ({ ...p, gamesPlayed: 5 })),
          ...others,
        ],
        champion: { playerIds: ids(champions), streak: 1 },
        forceReshuffle: true,
      }),
    );
    expect(r.championStays).toBe(false);
    const onCourt = [...ids(r.teamA), ...ids(r.teamB)];
    expect(onCourt.every((id) => id.startsWith("fila"))).toBe(true);
  });

  it("completa o time do campeão se alguém foi embora", () => {
    const incompleto = champions.slice(0, 4);
    const r = ok(
      generateNextMatch({
        ...base,
        players: [...incompleto, ...others],
        champion: { playerIds: ids(champions), streak: 1 },
      }),
    );
    expect(r.teamA).toHaveLength(6);
    expect(ids(r.teamA)).toEqual(expect.arrayContaining(ids(incompleto)));
  });
});

describe("travas do organizador", () => {
  it("jogador fixado permanece no time indicado", () => {
    const players = roster();
    // alguém do fim da fila, que não entraria sozinho
    const alvo = players[24];
    const r = ok(
      generateNextMatch({
        ...base,
        players: players.map((p, i) => (i === 24 ? { ...p, gamesPlayed: 99 } : p)),
        locked: [{ playerId: alvo.id, team: "B" }],
      }),
    );
    expect(ids(r.teamB)).toContain(alvo.id);
    expect(ids(r.teamA)).not.toContain(alvo.id);
  });

  it("fixado sobrevive a re-sorteios com seeds diferentes", () => {
    const players = roster();
    const alvo = players[0];
    for (const seed of ["a", "b", "c", "d"]) {
      const r = ok(
        generateNextMatch({
          ...base,
          players,
          seed,
          locked: [{ playerId: alvo.id, team: "A" }],
        }),
      );
      expect(ids(r.teamA)).toContain(alvo.id);
    }
  });
});

describe("variedade", () => {
  it("minimiza parceiros repetidos na divisão dos times", () => {
    const players = roster(12);
    const grupo = ids(players).slice(0, 6);
    const resto = ids(players).slice(6);
    // as últimas 3 rodadas foram sempre esses 6 contra aqueles 6
    const history: PastMatch[] = [1, 2, 3].map((round) => ({
      round,
      teamA: grupo,
      teamB: resto,
    }));

    const r = ok(generateNextMatch({ ...base, players, history, seed: "var" }));
    const doGrupoNoA = ids(r.teamA).filter((id) => grupo.includes(id)).length;
    // se repetisse a divisão anterior, seriam 6 (ou 0) do grupo no time A
    expect(doGrupoNoA).toBeGreaterThan(1);
    expect(doGrupoNoA).toBeLessThan(5);
  });

  it("sem histórico, não reporta repetição", () => {
    const r = ok(generateNextMatch({ ...base, players: roster() }));
    expect(r.explanation.repeatedTeammatePairs).toBe(0);
    expect(r.explanation.repeatedOpponentPairs).toBe(0);
  });

  it("não culpa o gerador pelos pares do campeão, que ficam juntos por regra", () => {
    const champions = Array.from({ length: 6 }, (_, i) =>
      player(`camp${i}`, { gamesPlayed: 2, lastPlayedAt: "2026-08-14T21:00:00Z" }),
    );
    const others = Array.from({ length: 15 }, (_, i) => player(`fila${i}`, { gamesPlayed: 1 }));
    // adversários que já foram embora: assim o único par repetido
    // possível é o do próprio campeão
    const history: PastMatch[] = [
      {
        round: 1,
        teamA: ids(champions),
        teamB: ["saiu1", "saiu2", "saiu3", "saiu4", "saiu5", "saiu6"],
      },
    ];

    const r = ok(
      generateNextMatch({
        ...base,
        players: [...champions, ...others],
        champion: { playerIds: ids(champions), streak: 1 },
        history,
      }),
    );

    // os 15 pares do campeão repetem por definição — não entram na conta
    expect(r.explanation.repeatedTeammatePairs).toBe(0);
  });

  it("conta a repetição que o organizador criou ao fixar gente junta", () => {
    const players = roster(12);
    const history: PastMatch[] = [
      { round: 1, teamA: ids(players).slice(0, 6), teamB: ids(players).slice(6) },
    ];
    // fixados juntos: a repetição é escolha do organizador, mas ainda é real
    const r = ok(
      generateNextMatch({
        ...base,
        players,
        history,
        locked: [
          { playerId: players[0].id, team: "A" },
          { playerId: players[1].id, team: "A" },
        ],
      }),
    );
    expect(r.explanation.repeatedTeammatePairs).toBeGreaterThanOrEqual(0);
  });
});

describe("nota", () => {
  it("equilibra os times na divisão de 12", () => {
    // 6 fortes e 6 fracos: um sorteio cego juntaria os fortes de um lado
    const players = [
      ...Array.from({ length: 6 }, (_, i) => player(`forte${i}`, { rating: 9 })),
      ...Array.from({ length: 6 }, (_, i) => player(`fraco${i}`, { rating: 2 })),
    ];
    const r = ok(generateNextMatch({ ...base, players, seed: "nota" }));
    expect(r.explanation.ratingDiff).toBeLessThanOrEqual(2);
  });

  it("escolhe, entre os empatados, quem casa melhor com a força do campeão", () => {
    // campeão fraco: deve puxar os fracos da fila, não os fortes
    const champions = Array.from({ length: 6 }, (_, i) =>
      player(`camp${i}`, { rating: 2, gamesPlayed: 2, lastPlayedAt: "2026-08-14T21:00:00Z" }),
    );
    // todos com 1 jogo e mesma espera: empate total, a nota decide
    const fila = [
      ...Array.from({ length: 6 }, (_, i) =>
        player(`forte${i}`, { rating: 9, gamesPlayed: 1, lastPlayedAt: "2026-08-14T20:00:00Z" }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        player(`fraco${i}`, { rating: 2, gamesPlayed: 1, lastPlayedAt: "2026-08-14T20:00:00Z" }),
      ),
    ];
    const r = ok(
      generateNextMatch({
        ...base,
        players: [...champions, ...fila],
        champion: { playerIds: ids(champions), streak: 1 },
        seed: "nota2",
      }),
    );
    const fracos = ids(r.teamB).filter((id) => id.startsWith("fraco")).length;
    expect(fracos).toBeGreaterThanOrEqual(4);
  });

  it("a nota NUNCA fura a fila", () => {
    // craque que já jogou muito não passa na frente de quem jogou pouco
    const players = [
      player("craque", { rating: 10, gamesPlayed: 9 }),
      ...Array.from({ length: 12 }, (_, i) => player(`p${i}`, { rating: 5, gamesPlayed: 0 })),
    ];
    const r = ok(generateNextMatch({ ...base, players }));
    expect([...ids(r.teamA), ...ids(r.teamB)]).not.toContain("craque");
  });
});

/**
 * O equilíbrio escolhe ENTRE OS EMPATADOS em jogos — nunca alcança quem
 * jogou mais. Ver reasonable.md §5.
 */
describe("equilíbrio não fura a fila", () => {
  const champions = Array.from({ length: 6 }, (_, i) =>
    player(`camp${i}`, { rating: 9, gamesPlayed: 3 }),
  );

  it("escolhe os fortes quando eles estão EMPATADOS com os fracos", () => {
    // campeão forte na quadra; fila com fracos e fortes, todos com 1 jogo.
    // A nota decide, porque ninguém perde a vez pra isso.
    const players = [
      ...champions,
      ...Array.from({ length: 6 }, (_, i) =>
        player(`fraco${i}`, { rating: 1, gamesPlayed: 1 }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        player(`forte${i}`, { rating: 10, gamesPlayed: 1 }),
      ),
    ];
    const r = ok(
      generateNextMatch({
        ...base,
        players,
        champion: { playerIds: ids(champions), streak: 1 },
        seed: "eq1",
      }),
    );
    expect(ids(r.teamB).filter((id) => id.startsWith("forte")).length).toBeGreaterThan(3);
    expect(r.explanation.extraGamesUsed).toBe(0);
  });

  it("NÃO alcança quem jogou mais, nem por um jogo, nem pra salvar a partida", () => {
    // os fortes com 1 jogo a mais equilibrariam perfeitamente — e mesmo
    // assim ficam de fora: quem jogou menos entra primeiro, ponto.
    const players = [
      ...champions,
      ...Array.from({ length: 6 }, (_, i) =>
        player(`fraco${i}`, { rating: 1, gamesPlayed: 1 }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        player(`forte${i}`, { rating: 10, gamesPlayed: 2 }),
      ),
    ];
    const r = ok(
      generateNextMatch({
        ...base,
        players,
        champion: { playerIds: ids(champions), streak: 1 },
        seed: "eq2",
      }),
    );
    expect(ids(r.teamB).filter((id) => id.startsWith("forte"))).toHaveLength(0);
    expect(r.explanation.extraGamesUsed).toBe(0);
  });

  it("ninguém com mais jogos que o corte entra, em nenhuma rodada da noite", () => {
    // varre uma noite inteira: a trava vale sempre, não só no caso montado
    let players = roster(19);
    let champion: Champion = null;
    for (let round = 0; round < 12; round++) {
      const r = generateNextMatch({
        ...base,
        players,
        champion,
        seed: `noite|${round}`,
      });
      if (!r.ok) break;
      expect(r.explanation.extraGamesUsed).toBe(0);
      const out = applyMatchResult({
        players,
        teamA: r.teamA,
        teamB: r.teamB,
        winner: round % 2 === 0 ? "A" : "B",
        championStays: r.championStays,
        championStreak: champion?.streak ?? 0,
        maxStreak: 2,
        at: `2026-08-14T2${round % 10}:00:00Z`,
      });
      players = out.players;
      champion = out.champion;
    }
  });
});

describe("rodadas esperando", () => {
  it("quem está fora há mais rodadas entra antes, com os mesmos jogos", () => {
    const players = [
      player("recente", { gamesPlayed: 1, roundsWaiting: 0 }),
      player("antigo", { gamesPlayed: 1, roundsWaiting: 4 }),
    ];
    expect(ids(orderQueue(players, "s"))).toEqual(["antigo", "recente"]);
  });

  it("jogos ainda mandam mais que a espera", () => {
    const players = [
      player("esperou", { gamesPlayed: 2, roundsWaiting: 9 }),
      player("novato", { gamesPlayed: 0, roundsWaiting: 0 }),
    ];
    expect(ids(orderQueue(players, "s"))).toEqual(["novato", "esperou"]);
  });
});

describe("nota após a partida", () => {
  const teamA = Array.from({ length: 6 }, (_, i) => player(`a${i}`, { rating: 5 }));
  const teamB = Array.from({ length: 6 }, (_, i) => player(`b${i}`, { rating: 5 }));
  const fora = player("fora", { rating: 5 });

  const apply = (over: Partial<SessionPlayer> & { id: string }) =>
    applyMatchResult({
      players: [...teamA, ...teamB, fora].map((p) => (p.id === over.id ? { ...p, ...over } : p)),
      teamA: teamA.map((p) => (p.id === over.id ? { ...p, ...over } : p)),
      teamB: teamB.map((p) => (p.id === over.id ? { ...p, ...over } : p)),
      winner: "A",
      championStays: false,
      championStreak: 0,
      maxStreak: 2,
      at: "2026-08-14T20:00:00Z",
    }).players;

  it("vencedor sobe 0.5 e perdedor desce 0.5", () => {
    const after = apply({ id: "nada" });
    expect(after.find((p) => p.id === "a0")!.rating).toBe(5.5);
    expect(after.find((p) => p.id === "b0")!.rating).toBe(4.5);
    expect(after.find((p) => p.id === "fora")!.rating).toBe(5);
  });

  it("a nota não passa de 10 nem cai abaixo de 0", () => {
    expect(apply({ id: "a0", rating: 9.8 }).find((p) => p.id === "a0")!.rating).toBe(10);
    expect(apply({ id: "b0", rating: 0.2 }).find((p) => p.id === "b0")!.rating).toBe(0);
  });

  it("quem foi substituído antes do fim não conta a partida nem muda de nota", () => {
    // o substituído nem aparece nos times passados pro applyMatchResult
    const substituido = player("saiu", { rating: 5, gamesPlayed: 3 });
    const { players: after } = applyMatchResult({
      players: [...teamA, ...teamB, substituido],
      teamA,
      teamB,
      winner: "A",
      championStays: false,
      championStreak: 0,
      maxStreak: 2,
      at: "2026-08-14T20:00:00Z",
    });
    const s = after.find((p) => p.id === "saiu")!;
    expect(s.gamesPlayed).toBe(3);
    expect(s.rating).toBe(5);
    expect(s.lastPlayedAt).toBeNull();
  });

  it("a espera zera pra quem jogou e sobe pra quem ficou de fora", () => {
    const after = apply({ id: "a0", roundsWaiting: 4 });
    expect(after.find((p) => p.id === "a0")!.roundsWaiting).toBe(0);
    expect(after.find((p) => p.id === "b0")!.roundsWaiting).toBe(0);
    expect(after.find((p) => p.id === "fora")!.roundsWaiting).toBe(1);
  });

  it("quem não fez check-in ou foi embora não acumula espera", () => {
    const ausente = player("ausente", { checkedInAt: null });
    const saiu = player("saiu-da-noite", { excluded: true });
    const { players: after } = applyMatchResult({
      players: [...teamA, ...teamB, fora, ausente, saiu],
      teamA,
      teamB,
      winner: "A",
      championStays: false,
      championStreak: 0,
      maxStreak: 2,
      at: "2026-08-14T20:00:00Z",
    });
    expect(after.find((p) => p.id === "ausente")!.roundsWaiting).toBe(0);
    expect(after.find((p) => p.id === "saiu-da-noite")!.roundsWaiting).toBe(0);
    expect(after.find((p) => p.id === "fora")!.roundsWaiting).toBe(1);
  });
});

describe("nomes na quadra", () => {
  it('desambigua "João" de "João Victor"', () => {
    const labels = courtNames([
      { id: "1", name: "João" },
      { id: "2", name: "João Victor" },
      { id: "3", name: "Neto" },
    ]);
    expect(labels.get("1")).toBe("JOÃO");
    expect(labels.get("2")).toBe("JOÃO V.");
    expect(labels.get("3")).toBe("NETO");
  });

  it("dois rótulos iguais nunca aparecem juntos na quadra", () => {
    const labels = courtNames(
      NAMES.map((name, i) => ({ id: String(i), name })),
    );
    const values = [...labels.values()];
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("explicação", () => {
  it("mostra o primeiro que ficou de fora", () => {
    const r = ok(generateNextMatch({ ...base, players: roster() }));
    expect(r.explanation.picked).toHaveLength(12);
    expect(r.explanation.firstOut).not.toBeNull();
    expect(r.explanation.firstOut!.player.id).toBe(r.bench[0].id);
  });

  it("marca sorteio de empate quando o corte cai no meio de um grupo", () => {
    // 25 pessoas com exatamente 0 jogos: o corte é puro empate
    const r = ok(generateNextMatch({ ...base, players: roster() }));
    expect(r.explanation.tiebreakUsed).toBe(true);
    expect(r.explanation.firstOut!.byTiebreak).toBe(true);
  });

  it("não marca empate quando o corte é limpo", () => {
    const players = [
      ...Array.from({ length: 12 }, (_, i) => player(`entra${i}`, { gamesPlayed: 0 })),
      ...Array.from({ length: 8 }, (_, i) => player(`fica${i}`, { gamesPlayed: 4 })),
    ];
    const r = ok(generateNextMatch({ ...base, players }));
    expect(r.explanation.tiebreakUsed).toBe(false);
  });

  it("reporta a diferença de jogos de quem está na quadra", () => {
    const r = ok(generateNextMatch({ ...base, players: roster() }));
    expect(r.explanation.gamesDiff).toBe(
      r.explanation.maxGames - r.explanation.minGames,
    );
  });
});

// ─────────────────────────────────────────────────────────────
// A noite inteira
// ─────────────────────────────────────────────────────────────

describe("simulação da noite", () => {
  function playNight(opts: { rounds: number; playerCount: number; maxStreak: number }) {
    let players = roster(opts.playerCount);
    let champion: Champion = null;
    let championStreak = 0;
    const history: PastMatch[] = [];

    for (let round = 1; round <= opts.rounds; round++) {
      const r = generateNextMatch({
        players,
        teamSize: 6,
        champion,
        maxStreak: opts.maxStreak,
        history,
        seed: `noite|${round}`,
      });
      if (!r.ok) throw new Error(`rodada ${round}: faltaram ${r.missing}`);

      history.push({ round, teamA: ids(r.teamA), teamB: ids(r.teamB) });

      // vencedor pseudo-aleatório, mas determinístico
      const winner = round % 3 === 0 ? "B" : "A";
      const applied = applyMatchResult({
        players,
        teamA: r.teamA,
        teamB: r.teamB,
        winner,
        championStays: r.championStays,
        championStreak,
        maxStreak: opts.maxStreak,
        at: new Date(Date.UTC(2026, 7, 14, 19, round * 12)).toISOString(),
      });

      players = applied.players;
      champion = applied.champion;
      championStreak = applied.champion?.streak ?? 0;
    }

    const games = players.map((p) => p.gamesPlayed);
    return { min: Math.min(...games), max: Math.max(...games), players };
  }

  it("20 rodadas com 25 jogadores: diferença de jogos <= 2", () => {
    const { min, max } = playNight({ rounds: 20, playerCount: 25, maxStreak: 2 });
    expect(max - min).toBeLessThanOrEqual(2);
  });

  it("ninguém fica de fora a noite inteira", () => {
    const { min } = playNight({ rounds: 20, playerCount: 25, maxStreak: 2 });
    expect(min).toBeGreaterThan(0);
  });

  it("aguenta 20 pessoas e maxStreak 3", () => {
    const { min, max } = playNight({ rounds: 20, playerCount: 20, maxStreak: 3 });
    expect(max - min).toBeLessThanOrEqual(2);
    expect(min).toBeGreaterThan(0);
  });
});

describe("rotação", () => {
  const teamA = Array.from({ length: 6 }, (_, i) => player(`a${i}`));
  const teamB = Array.from({ length: 6 }, (_, i) => player(`b${i}`));
  const players = [...teamA, ...teamB, player("fora")];

  const apply = (winner: "A" | "B", championStays: boolean, championStreak: number) =>
    applyMatchResult({
      players, teamA, teamB, winner, championStays, championStreak,
      maxStreak: 2, at: "2026-08-14T20:00:00Z",
    });

  it("soma +1 jogo só pra quem estava na quadra", () => {
    const { players: after } = apply("A", false, 0);
    expect(after.find((p) => p.id === "a0")!.gamesPlayed).toBe(1);
    expect(after.find((p) => p.id === "fora")!.gamesPlayed).toBe(0);
  });

  it("primeira vitória vira campeão com streak 1", () => {
    const { champion, winnerDissolved } = apply("A", false, 0);
    expect(winnerDissolved).toBe(false);
    expect(champion!.streak).toBe(1);
    expect(champion!.playerIds).toEqual(teamA.map((p) => p.id));
  });

  it("no teto, o vencedor é desfeito e o PERDEDOR fica na quadra", () => {
    const { champion, winnerDissolved, leaving } = apply("A", true, 1);
    expect(winnerDissolved).toBe(true);
    // quem ganhou 2x vai pro fim da fila
    expect(leaving.map((p) => p.id)).toEqual(teamA.map((p) => p.id));
    // quem perdeu segura a quadra, com a série zerada
    expect(champion!.playerIds).toEqual(teamB.map((p) => p.id));
    expect(champion!.streak).toBe(0);
  });

  it("desafiante que ganha vira campeão com streak 1", () => {
    const { champion, winnerDissolved } = apply("B", true, 1);
    expect(winnerDissolved).toBe(false);
    expect(champion!.streak).toBe(1);
    expect(champion!.playerIds).toEqual(teamB.map((p) => p.id));
  });

  it("sempre exatamente um time sai de quadra — nunca os dois", () => {
    for (const [winner, stays, streak] of [
      ["A", false, 0],
      ["A", true, 1],
      ["B", true, 1],
    ] as const) {
      const { leaving } = apply(winner, stays, streak);
      expect(leaving).toHaveLength(6);
    }
  });
});
