"use client";

import { useMemo, useState } from "react";
import { Header } from "./Header";
import { LiveStrip } from "./LiveStrip";
import { CourtCard, EmptyCourt } from "./CourtCard";
import { Queue } from "./Queue";
import { BottomBar, type BottomState } from "./BottomBar";
import { WhySheet } from "./WhySheet";
import { generateNextMatch, orderQueue } from "@/lib/match-generator";
import { checkIn, finishMatch, generateMatch, type LiveState } from "@/lib/db";
import { clearMe, isOrganizer, setOrganizer } from "@/lib/identity";
import type { Team } from "@/lib/types";

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", month: "short" })
    .format(new Date(`${iso}T12:00:00`))
    .replace(/\./g, "");

export function Lobby({
  state,
  stale,
  meId,
  refresh,
}: {
  state: LiveState;
  stale: boolean;
  meId: string;
  refresh: () => Promise<void>;
}) {
  const [org, setOrg] = useState(isOrganizer());
  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const match = state.activeMatch;
  const onCourt = useMemo(
    () => new Set([...(match?.teamA ?? []), ...(match?.teamB ?? [])].map((p) => p.id)),
    [match],
  );

  const checkedIn = state.players.filter((p) => p.checkedInAt !== null);
  const me = state.players.find((p) => p.id === meId);
  const amCheckedIn = Boolean(me?.checkedInAt);

  const queue = useMemo(
    () =>
      orderQueue(
        checkedIn.filter((p) => !onCourt.has(p.id) && !p.excluded),
        `${state.sessionId}|${state.round + 1}|`,
      ),
    [checkedIn, onCourt, state.sessionId, state.round],
  );

  // prévia da próxima partida, só pra explicar a fila — não grava nada
  const preview = useMemo(() => {
    const r = generateNextMatch({
      players: state.players,
      teamSize: state.teamSize,
      champion: state.championIds.length
        ? { playerIds: state.championIds, streak: state.championStreak }
        : null,
      maxStreak: state.maxStreak,
      history: state.history,
      seed: `${state.sessionId}|${state.round + 1}|`,
    });
    return r.ok ? r.explanation : null;
  }, [state]);

  const myQueuePos = queue.findIndex((p) => p.id === meId) + 1;
  const amPlaying = onCourt.has(meId);

  async function run(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const doCheckIn = () =>
    run(async () => {
      await checkIn(state.sessionId, meId);
      navigator.vibrate?.(30);
    });

  const doGenerate = () =>
    run(async () => {
      const r = await generateMatch(state);
      if (!r.ok) setMsg(`Faltam ${r.missing} pra formar os times.`);
    });

  const doFinish = (winner: Team) =>
    run(async () => {
      await finishMatch(state, winner);
      navigator.vibrate?.(30);
    });

  const askPin = async () => {
    const pin = window.prompt("PIN do organizador");
    if (!pin) return;
    const res = await fetch("/api/organizer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    if (res.ok) {
      setOrganizer(true);
      setOrg(true);
    } else {
      setMsg("PIN errado.");
    }
  };

  let bottom: BottomState;
  if (!amCheckedIn) bottom = { kind: "check-in", onAction: doCheckIn };
  else if (amPlaying) bottom = { kind: "playing" };
  else if (org && !match) bottom = { kind: "generate", onAction: doGenerate, disabled: busy };
  else if (myQueuePos > 0) bottom = { kind: "in-queue", position: myQueuePos };
  else bottom = { kind: "check-in", onAction: doCheckIn };

  const missing = state.teamSize * 2 - checkedIn.length;

  return (
    <>
      <Header
        dateLabel={dateLabel(state.date)}
        isOrganizer={org}
        onOpenEdit={() => setMsg("Modo edição chega na próxima entrega.")}
      />
      <LiveStrip
        checkedIn={checkedIn.length}
        round={match ? match.round : null}
        stale={stale}
      />

      <main className="flex-1 overflow-y-auto">
        {match ? (
          <CourtCard
            teamA={match.teamA}
            teamB={match.teamB}
            championTeam={match.championStays ? "A" : null}
            streak={match.championStreak}
            meId={meId}
            canFinish={org}
            onWin={doFinish}
          />
        ) : (
          <EmptyCourt missing={Math.max(0, missing)} />
        )}

        {msg && (
          <p className="text-live mx-4 mt-3 text-center text-sm">{msg}</p>
        )}

        {org && match && (
          <button
            type="button"
            onClick={doGenerate}
            disabled={busy}
            className="font-display text-muted hover:text-ink mx-4 mt-3 h-12 w-full text-sm tracking-widest uppercase disabled:opacity-40"
          >
            🎲 re-sortear esta partida
          </button>
        )}

        <Queue players={queue} meId={meId} onExplain={() => setWhy(true)} />

        <div className="text-muted flex justify-center gap-4 pb-4 text-xs">
          <button type="button" onClick={() => { clearMe(); location.reload(); }}>
            não é você?
          </button>
          {!org && (
            <button type="button" onClick={askPin}>
              sou organizador
            </button>
          )}
        </div>
      </main>

      <BottomBar state={bottom} />

      {why && (
        <WhySheet
          explanation={preview}
          teamSize={state.championIds.length ? state.teamSize : state.teamSize * 2}
          onClose={() => setWhy(false)}
        />
      )}
    </>
  );
}
