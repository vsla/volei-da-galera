/**
 * Teste de ponta a ponta contra o Supabase de verdade.
 *
 * Usa uma sessão descartável datada no futuro (o fetchState sempre pega
 * a data mais recente), e no fim apaga tudo e restaura as notas que
 * foram alteradas — a sessão real da sexta não é tocada.
 *
 *   npm run smoke
 */

import WebSocket from "ws";

// O supabase-js monta um cliente realtime já na importação, e o Node 20
// não tem WebSocket nativo. No browser isso não acontece — aqui o
// polyfill precisa existir ANTES de importar o cliente.
(globalThis as { WebSocket?: unknown }).WebSocket ??= WebSocket;

const DATE = "2030-01-01";
let failures = 0;

function check(label: string, cond: boolean, detail = "") {
  console.log(`${cond ? "  ok  " : "  FALHOU  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  const { supabase } = await import("../src/lib/supabase");
  const {
    castVotes,
    checkIn,
    fetchHighlights,
    fetchState,
    finishMatch,
    generateMatch,
    leaveSession,
    openVoting,
    swapPlayer,
  } = await import("../src/lib/db");

  // ── snapshot das notas, pra devolver tudo como estava ──────
  const { data: before } = await supabase.from("players").select("id, rating");
  const original = new Map((before ?? []).map((p) => [p.id as string, p.rating]));
  console.log(`\n${original.size} jogadores no banco. Nota salva pra restaurar depois.\n`);

  // ── sessão descartável ────────────────────────────────────
  await supabase.from("sessions").delete().eq("date", DATE);
  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ date: DATE, team_size: 6, max_streak: 2 })
    .select("id")
    .single();
  if (error || !session) throw new Error(`não criou a sessão: ${error?.message}`);
  const sessionId = session.id as string;

  try {
    const { data: players } = await supabase.from("players").select("id, name").limit(15);
    const roster = (players ?? []) as { id: string; name: string }[];
    check("banco tem 15+ jogadores", roster.length >= 14, `${roster.length}`);

    for (const p of roster.slice(0, 14)) await checkIn(sessionId, p.id);

    let state = await fetchState();
    check("fetchState pegou a sessão descartável", state?.sessionId === sessionId);
    check(
      "14 com check-in",
      state!.players.filter((p) => p.checkedInAt).length === 14,
      `${state!.players.filter((p) => p.checkedInAt).length}`,
    );

    // ── gerar ───────────────────────────────────────────────
    const gen = await generateMatch(state!);
    check("gerou a primeira partida", gen.ok, "error" in gen ? String(gen.error) : "");

    state = await fetchState();
    const m1 = state!.activeMatch;
    check("partida ativa com 6x6", m1?.teamA.length === 6 && m1?.teamB.length === 6);
    check("rodada 1", m1?.round === 1, String(m1?.round));
    check("ninguém em dois times", new Set([...m1!.teamA, ...m1!.teamB].map((p) => p.id)).size === 12);

    // ── substituir alguém antes de acabar ───────────────────
    const sai = m1!.teamB[0];
    const entra = state!.players.find(
      (p) => p.checkedInAt && ![...m1!.teamA, ...m1!.teamB].some((q) => q.id === p.id),
    )!;
    await swapPlayer(m1!.id, sai.id, entra.id);
    state = await fetchState();
    const times = [...state!.activeMatch!.teamA, ...state!.activeMatch!.teamB].map((p) => p.id);
    check("substituto entrou", times.includes(entra.id));
    check("substituído saiu da quadra", !times.includes(sai.id));

    // ── finalizar ───────────────────────────────────────────
    await finishMatch(state!, "A");
    state = await fetchState();

    const jogou = state!.players.find((p) => p.id === state!.championIds[0])!;
    check("vencedor virou campeão", state!.championIds.length === 6);
    check("streak 1", state!.championStreak === 1, String(state!.championStreak));
    check("quem jogou tem 1 jogo", jogou.gamesPlayed === 1, String(jogou.gamesPlayed));
    check("vencedor subiu pra 5.5", jogou.rating === 5.5, String(jogou.rating));

    const substituido = state!.players.find((p) => p.id === sai.id)!;
    check(
      "substituído NÃO contou a partida",
      substituido.gamesPlayed === 0 && substituido.rating === 5,
      `jogos=${substituido.gamesPlayed} nota=${substituido.rating}`,
    );

    // ── segunda partida: campeão fica ───────────────────────
    const gen2 = await generateMatch(state!);
    check("gerou a segunda partida", gen2.ok);
    state = await fetchState();
    const m2 = state!.activeMatch!;
    check("campeão continua na quadra como time A", m2.championStays === true);
    check(
      "time A é o campeão",
      m2.teamA.every((p) => state!.championIds.includes(p.id)),
    );
    check("6 desafiantes novos", m2.teamB.length === 6);

    // ── terceira: vencedor bate o teto e sai, perdedor fica ─
    await finishMatch(state!, "A");
    state = await fetchState();
    const perdedoresM2 = m2.teamB.map((p) => p.id);
    check(
      "no teto, o PERDEDOR ficou na quadra",
      perdedoresM2.every((id) => state!.championIds.includes(id)),
      `campeões=${state!.championIds.length}`,
    );
    check("série zerada", state!.championStreak === 0, String(state!.championStreak));

    // ── foi embora ──────────────────────────────────────────
    const quemSai = state!.players.find((p) => state!.championIds.includes(p.id))!;
    const fila = state!.players.filter(
      (p) => p.checkedInAt && !p.excluded && !state!.championIds.includes(p.id),
    );
    await leaveSession(state!, quemSai.id, fila[0]?.id ?? null);
    state = await fetchState();
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
    state = await fetchState();
    check(
      "gerador completou o time que estava desfalcado",
      state!.activeMatch?.teamA.length === 6,
      `time A=${state!.activeMatch?.teamA.length}`,
    );
    check(
      "quem foi embora não voltou pra quadra",
      ![...state!.activeMatch!.teamA, ...state!.activeMatch!.teamB].some(
        (p) => p.id === quemSai.id,
      ),
    );

    // ── destaques ───────────────────────────────────────────
    await openVoting(sessionId);
    state = await fetchState();
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
    await supabase.from("sessions").delete().eq("id", sessionId);
    await Promise.all(
      [...original].map(([id, rating]) =>
        supabase.from("players").update({ rating }).eq("id", id),
      ),
    );
    const { data: sobrou } = await supabase.from("sessions").select("date");
    console.log(
      `\nlimpeza: sessões restantes = ${(sobrou ?? []).map((s) => s.date).join(", ")}`,
    );
    console.log("notas restauradas.");
  }

  console.log(failures === 0 ? "\n✅ tudo passou\n" : `\n❌ ${failures} falha(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
