/**
 * Teste de ponta a ponta contra o Supabase de verdade.
 *
 * Desde a 0012 ele roda numa PELADA descartável, não mais numa data
 * descartável: tudo que o teste cria (membros, sessão, partidas, votos)
 * pendura na pelada e some junto com ela por cascade. A pelada real da
 * sexta — e a nota de todo mundo nela — não é tocada em momento nenhum.
 *
 *   npm run smoke
 */

import WebSocket from "ws";

// O supabase-js monta um cliente realtime já na importação, e o Node 20
// não tem WebSocket nativo. No browser isso não acontece — aqui o
// polyfill precisa existir ANTES de importar o cliente.
(globalThis as { WebSocket?: unknown }).WebSocket ??= WebSocket;

const DATE = "2030-01-01";
const SLUG = "smoke-test";
let failures = 0;

function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "  ok  " : "  FALHOU  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  const { supabase } = await import("../src/lib/supabase");
  const {
    bumpScore,
    castVotes,
    checkIn,
    fetchHighlights,
    fetchState,
    finishMatch,
    generateMatch,
    leaveSession,
    openVoting,
    swapPlayer,
    swapSides,
  } = await import("../src/lib/db");

  // ── pelada descartável ────────────────────────────────────
  await supabase.from("peladas").delete().eq("slug", SLUG);
  const { data: pelada, error: perr } = await supabase
    .from("peladas")
    .insert({ slug: SLUG, name: "Pelada de teste", weekday: 5 })
    .select("id")
    .single();
  if (perr || !pelada) throw new Error(`não criou a pelada: ${perr?.message}`);
  const peladaId = pelada.id as string;

  try {
    const { data: players } = await supabase.from("players").select("id, name").limit(15);
    const roster = (players ?? []) as { id: string; name: string }[];
    check("banco tem 15+ jogadores", roster.length >= 14, `${roster.length}`);

    // membros da pelada de teste — nota começa em 5 pra todo mundo
    await supabase.from("pelada_members").insert(
      roster.map((p) => ({ pelada_id: peladaId, player_id: p.id, role: "player" })),
    );

    const { data: session, error } = await supabase
      .from("sessions")
      .insert({ pelada_id: peladaId, date: DATE, team_size: 6, max_streak: 2 })
      .select("id")
      .single();
    if (error || !session) throw new Error(`não criou a sessão: ${error?.message}`);
    const sessionId = session.id as string;

    for (const p of roster.slice(0, 14)) await checkIn(sessionId, p.id);

    let state = await fetchState(peladaId);
    check("fetchState pegou a sessão da pelada", state?.sessionId === sessionId);
    check("configuração resolvida", state?.settings.teamSize === 6);
    check(
      "14 com check-in",
      state!.players.filter((p) => p.checkedInAt).length === 14,
      `${state!.players.filter((p) => p.checkedInAt).length}`,
    );

    // ── gerar ───────────────────────────────────────────────
    const gen = await generateMatch(state!);
    check("gerou a primeira partida", gen.ok, "error" in gen ? String(gen.error) : "");

    state = await fetchState(peladaId);
    const m1 = state!.activeMatch;
    check("partida ativa com 6x6", m1?.teamA.length === 6 && m1?.teamB.length === 6);
    check("rodada 1", m1?.round === 1, String(m1?.round));
    check("ninguém em dois times", new Set([...m1!.teamA, ...m1!.teamB].map((p) => p.id)).size === 12);
    check("partida do zero não tem dono da quadra", m1?.holderTeam === null);

    // ── placar ao vivo (0010) ───────────────────────────────
    await bumpScore(m1!.id, "A", 1);
    await bumpScore(m1!.id, "A", 1);
    await bumpScore(m1!.id, "B", 1);
    state = await fetchState(peladaId);
    check(
      "placar somou no banco, não no aparelho",
      state!.activeMatch?.scoreA === 2 && state!.activeMatch?.scoreB === 1,
      `${state!.activeMatch?.scoreA}x${state!.activeMatch?.scoreB}`,
    );

    // ── trocar de lado (0011) ───────────────────────────────
    const antesA = state!.activeMatch!.teamA.map((p) => p.id).sort();
    await swapSides(state!.activeMatch!.id);
    state = await fetchState(peladaId);
    check(
      "trocar de lado levou o time inteiro pro outro lado",
      state!.activeMatch!.teamB.map((p) => p.id).sort().join() === antesA.join(),
    );
    check(
      "o placar trocou de lado junto",
      state!.activeMatch?.scoreA === 1 && state!.activeMatch?.scoreB === 2,
      `${state!.activeMatch?.scoreA}x${state!.activeMatch?.scoreB}`,
    );
    await swapSides(state!.activeMatch!.id);
    state = await fetchState(peladaId);

    // ── substituir alguém antes de acabar ───────────────────
    const sai = state!.activeMatch!.teamB[0];
    const entra = state!.players.find(
      (p) =>
        p.checkedInAt &&
        ![...state!.activeMatch!.teamA, ...state!.activeMatch!.teamB].some(
          (q) => q.id === p.id,
        ),
    )!;
    await swapPlayer(state!.activeMatch!.id, sai.id, entra.id);
    state = await fetchState(peladaId);
    const times = [...state!.activeMatch!.teamA, ...state!.activeMatch!.teamB].map((p) => p.id);
    check("substituto entrou", times.includes(entra.id));
    check("substituído saiu da quadra", !times.includes(sai.id));

    // ── finalizar ───────────────────────────────────────────
    await finishMatch(state!, "A");
    state = await fetchState(peladaId);

    const jogou = state!.players.find((p) => p.id === state!.championIds[0])!;
    check("vencedor virou campeão", state!.championIds.length === 6);
    check("streak 1", state!.championStreak === 1, String(state!.championStreak));
    check("campeão ficou do lado A", state!.championTeam === "A", String(state!.championTeam));
    check("quem jogou tem 1 jogo", jogou.gamesPlayed === 1, String(jogou.gamesPlayed));
    check("vencedor subiu pra 5.5 NA PELADA", jogou.rating === 5.5, String(jogou.rating));

    const substituido = state!.players.find((p) => p.id === sai.id)!;
    check(
      "substituído NÃO contou a partida",
      substituido.gamesPlayed === 0 && substituido.rating === 5,
      `jogos=${substituido.gamesPlayed} nota=${substituido.rating}`,
    );

    // ── segunda partida: campeão fica, do mesmo lado ────────
    const gen2 = await generateMatch(state!);
    check("gerou a segunda partida", gen2.ok);
    state = await fetchState(peladaId);
    const m2 = state!.activeMatch!;
    check("campeão continua na quadra", m2.championStays === true);
    check("o dono da quadra é o lado A", m2.holderTeam === "A", String(m2.holderTeam));
    check(
      "o lado A é o campeão",
      m2.teamA.every((p) => state!.championIds.includes(p.id)),
    );
    check("6 desafiantes novos", m2.teamB.length === 6);

    // ── terceira: vencedor bate o teto e sai, perdedor fica ─
    await finishMatch(state!, "A");
    state = await fetchState(peladaId);
    const perdedoresM2 = m2.teamB.map((p) => p.id);
    check(
      "no teto, o PERDEDOR ficou na quadra",
      perdedoresM2.every((id) => state!.championIds.includes(id)),
      `campeões=${state!.championIds.length}`,
    );
    check("série zerada", state!.championStreak === 0, String(state!.championStreak));
    check(
      "e ele ficou NO LADO DELE — não virou o time A",
      state!.championTeam === "B",
      String(state!.championTeam),
    );

    // ── foi embora ──────────────────────────────────────────
    const quemSai = state!.players.find((p) => state!.championIds.includes(p.id))!;
    const fila = state!.players.filter(
      (p) => p.checkedInAt && !p.excluded && !state!.championIds.includes(p.id),
    );
    await leaveSession(state!, quemSai.id, fila[0]?.id ?? null);
    state = await fetchState(peladaId);
    check(
      "quem foi embora saiu da sessão",
      state!.players.find((p) => p.id === quemSai.id)!.excluded === true,
    );
    check(
      "quem foi embora saiu do time que segura a quadra",
      !state!.championIds.includes(quemSai.id),
      `campeões=${state!.championIds.length}`,
    );

    // Sem partida em andamento não há vaga pra preencher na hora: o time
    // fica com 5 e o gerador completa sozinho na próxima rodada.
    const gen3 = await generateMatch(state!);
    check("gerou a partida seguinte", gen3.ok);
    state = await fetchState(peladaId);
    const dono = state!.activeMatch!.holderTeam === "B" ? "teamB" : "teamA";
    check(
      "gerador completou o time que estava desfalcado",
      state!.activeMatch![dono].length === 6,
      `${dono}=${state!.activeMatch![dono].length}`,
    );
    check(
      "quem foi embora não voltou pra quadra",
      ![...state!.activeMatch!.teamA, ...state!.activeMatch!.teamB].some(
        (p) => p.id === quemSai.id,
      ),
    );

    // ── destaques ───────────────────────────────────────────
    await openVoting(sessionId);
    state = await fetchState(peladaId);
    check("votação aberta", state!.status === "voting");

    const votantes = state!.players.filter((p) => p.checkedInAt).slice(0, 5);
    for (const v of votantes) {
      const escolhas = votantes.filter((p) => p.id !== v.id).slice(0, 3).map((p) => p.id);
      await castVotes(sessionId, v.id, escolhas);
    }
    const hl = await fetchHighlights(sessionId, state!.players);
    check("3 destaques", hl.winners.length === 3, hl.winners.map((p) => p.name).join(", "));
    check("contou os votantes", hl.voters === 5, String(hl.voters));
  } finally {
    // ── limpeza ─────────────────────────────────────────────
    // a pelada leva junto membros, sessões, partidas e votos (cascade).
    // A nota real de ninguém é tocada: ela mora em pelada_members.
    await supabase.from("peladas").delete().eq("slug", SLUG);
    const { data: sobrou } = await supabase.from("peladas").select("slug");
    console.log(
      `\nlimpeza: peladas restantes = ${(sobrou ?? []).map((s) => s.slug).join(", ")}`,
    );
  }

  console.log(failures === 0 ? "\n✅ tudo certo\n" : `\n❌ ${failures} falha(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
