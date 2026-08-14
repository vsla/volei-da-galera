"use client";

import { useMemo, useState } from "react";
import { Header } from "./Header";
import { LiveStrip } from "./LiveStrip";
import { CourtCard, EmptyCourt } from "./CourtCard";
import { Queue } from "./Queue";
import { BottomBar, type BottomState } from "./BottomBar";
import { WhySheet } from "./WhySheet";
import { NextUpSheet } from "./NextUpSheet";
import { ResetSheet } from "./ResetSheet";
import { OrganizerMenu } from "./OrganizerMenu";
import { PlayerSheet, type PlayerContext } from "./PlayerSheet";
import { Highlights } from "./Highlights";
import { OrganizerSheet } from "./OrganizerSheet";
import { CheckInSheet } from "./CheckInSheet";
import { generateNextMatch, orderQueue } from "@/lib/match-generator";
import {
  checkIn,
  finishMatch,
  generateMatch,
  leaveSession,
  movePlayer,
  openVoting,
  rejoinSession,
  reopenSession,
  resetSession,
  swapPlayer,
  undoCheckIn,
  type FinishSummary,
  type LiveState,
} from "@/lib/db";
import { clearMe, isOrganizer, setOrganizer } from "@/lib/identity";
import type { SessionPlayer, Team } from "@/lib/types";

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
  const [screen, setScreen] = useState<"lobby" | "highlights">("lobby");
  const [askOrg, setAskOrg] = useState(false);
  const [checkIns, setCheckIns] = useState(false);
  const [askReset, setAskReset] = useState(false);
  const [menu, setMenu] = useState(false);
  // partida recém-encerrada, esperando o organizador confirmar a próxima
  const [nextUp, setNextUp] = useState<
    { summary: FinishSummary; nonce: string } | null
  >(null);
  const [sheet, setSheet] = useState<
    { player: SessionPlayer; context: PlayerContext } | null
  >(null);

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

  /**
   * Prévia da PRÓXIMA partida, com times.
   *
   * Usa o mesmo seed que o "Começar esta partida" vai gravar (`nonce`),
   * então o que aparece na tela é exatamente o que entra em quadra —
   * nada de sortear de novo escondido no confirm.
   */
  const nextUpMatch = useMemo(() => {
    if (!nextUp) return null;
    const r = generateNextMatch({
      players: state.players,
      teamSize: state.teamSize,
      champion: state.championIds.length
        ? { playerIds: state.championIds, streak: state.championStreak }
        : null,
      maxStreak: state.maxStreak,
      history: state.history,
      seed: `${state.sessionId}|${state.round + 1}|${nextUp.nonce}`,
    });
    return r;
  }, [nextUp, state]);

  /**
   * Ranking de nota — posição de cada um, 1 = maior nota. Igual ao do
   * bot. Só o organizador recebe: pra galera a nota segue invisível.
   */
  const ranking = useMemo(() => {
    if (!org) return undefined;
    const sorted = state.players
      .slice()
      .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
    return new Map(sorted.map((p, i) => [p.id, i + 1]));
  }, [org, state.players]);

  /** Quem entra na próxima partida, pra fila marcar com ▶. */
  const nextUpIds = useMemo(() => {
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
    if (!r.ok) return undefined;
    const champions = new Set(state.championIds);
    return new Set(
      [...r.teamA, ...r.teamB].map((p) => p.id).filter((id) => !champions.has(id)),
    );
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

  const doGenerate = (replaceActive = false) =>
    run(async () => {
      const r = await generateMatch(state, {
        replaceActive,
        forceReshuffle: replaceActive,
        nonce: String(Date.now()),
      });
      if (!r.ok) {
        setMsg(
          r.error ??
            (r.missing > 0
              ? `Faltam ${r.missing} pra formar os times.`
              : "Não deu pra gerar a partida."),
        );
      }
    });

  const doFinish = (winner: Team) =>
    run(async () => {
      const summary = await finishMatch(state, winner);
      navigator.vibrate?.(30);
      // a próxima partida não é gravada aqui: primeiro a galera vê
      // quem fica, quem sai e quem entra
      if (summary) setNextUp({ summary, nonce: String(Date.now()) });
    });

  const doConfirmNext = () =>
    run(async () => {
      if (!nextUp) return;
      const r = await generateMatch(state, { nonce: nextUp.nonce });
      if (r.ok) {
        setNextUp(null);
      } else {
        setMsg(
          r.error ??
            (r.missing > 0
              ? `Faltam ${r.missing} pra formar os times.`
              : "Não deu pra gerar a partida."),
        );
      }
    });

  const doReset = () =>
    run(async () => {
      await resetSession(state.sessionId);
      setAskReset(false);
      setNextUp(null);
      navigator.vibrate?.(30);
    });

  const doReopen = () =>
    run(async () => {
      await reopenSession(state.sessionId, state.round > 0);
      setScreen("lobby");
      navigator.vibrate?.(30);
    });

  const gone = state.players.filter((p) => p.excluded && p.checkedInAt !== null);

  const closeSheet = () => setSheet(null);

  const doSwap = (outId: string, inId: string) =>
    run(async () => {
      if (!match) return;
      await swapPlayer(match.id, outId, inId);
      closeSheet();
    });

  const doMove = (playerId: string, team: Team) =>
    run(async () => {
      if (!match) return;
      await movePlayer(match.id, playerId, team);
      closeSheet();
    });

  const doLeave = (playerId: string, replacementId: string | null) =>
    run(async () => {
      await leaveSession(state, playerId, replacementId);
      closeSheet();
    });

  const doRejoin = (playerId: string) =>
    run(async () => {
      await rejoinSession(state.sessionId, playerId);
      closeSheet();
    });

  if (screen === "highlights") {
    return (
      <Highlights
        state={state}
        meId={meId}
        isOrganizer={org}
        onBack={() => setScreen("lobby")}
        refresh={refresh}
      />
    );
  }

  let bottom: BottomState;
  if (state.status === "voting" || state.status === "closed")
    bottom = { kind: "vote", onAction: () => setScreen("highlights") };
  else if (!amCheckedIn) bottom = { kind: "check-in", onAction: doCheckIn };
  else if (amPlaying) bottom = { kind: "playing" };
  else if (org && !match)
    bottom = { kind: "generate", onAction: () => doGenerate(false), disabled: busy };
  else if (myQueuePos > 0) bottom = { kind: "in-queue", position: myQueuePos };
  else bottom = { kind: "check-in", onAction: doCheckIn };

  const missing = state.teamSize * 2 - checkedIn.length;

  return (
    <>
      <Header
        dateLabel={dateLabel(state.date)}
        isOrganizer={org}
        onOpenEdit={() => setMenu(true)}
      />
      <LiveStrip
        checkedIn={checkedIn.length}
        round={match ? match.round : null}
        stale={stale}
      />

      {/* overscroll-contain: chegou no fim da fila, para. Não arrasta a página junto. */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        {match ? (
          <CourtCard
            teamA={match.teamA}
            teamB={match.teamB}
            championTeam={match.championStays ? "A" : null}
            streak={match.championStreak}
            meId={meId}
            canFinish={org}
            ranking={ranking}
            onWin={doFinish}
            onPlayerTap={
              org
                ? (player, team) => setSheet({ player, context: { where: "court", team } })
                : undefined
            }
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
            onClick={() => doGenerate(true)}
            disabled={busy}
            className="font-display text-muted hover:text-ink mx-4 mt-3 block h-12 text-sm tracking-widest uppercase disabled:opacity-40"
          >
            🎲 re-sortear esta partida
          </button>
        )}

        <Queue
          players={queue}
          meId={meId}
          ranking={ranking}
          nextUpIds={nextUpIds}
          onExplain={() => setWhy(true)}
          onPlayerTap={
            org ? (player) => setSheet({ player, context: { where: "queue" } }) : undefined
          }
        />

        {org && gone.length > 0 && (
          <section className="px-4 pb-2">
            <h2 className="font-display text-muted mb-2 text-sm tracking-widest uppercase">
              Foram embora
            </h2>
            <ul className="flex flex-wrap gap-2">
              {gone.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSheet({ player: p, context: { where: "gone" } })}
                    className="font-display border-border text-muted h-10 rounded-full border px-3 text-sm tracking-wide uppercase"
                  >
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ações de organizador moram na engrenagem, não no scroll da fila */}

        <div className="text-muted flex justify-center gap-4 pb-4 text-xs">
          <button type="button" onClick={() => { clearMe(); location.reload(); }}>
            não é você?
          </button>
          {!org && (
            <button type="button" onClick={() => setAskOrg(true)}>
              sou organizador
            </button>
          )}
        </div>
      </main>

      <BottomBar state={bottom} />

      {sheet && (
        <PlayerSheet
          player={sheet.player}
          context={sheet.context}
          queue={
            sheet.context.where === "court"
              ? queue
              : // pra alguém da fila entrar, escolhe quem sai da quadra
                [...(match?.teamA ?? []), ...(match?.teamB ?? [])]
          }
          onSwap={(otherId) =>
            sheet.context.where === "court"
              ? doSwap(sheet.player.id, otherId)
              : doSwap(otherId, sheet.player.id)
          }
          onMove={(team) => doMove(sheet.player.id, team)}
          onLeave={(replacementId) => doLeave(sheet.player.id, replacementId)}
          onRejoin={() => doRejoin(sheet.player.id)}
          onClose={closeSheet}
        />
      )}

      {menu && (
        <OrganizerMenu
          status={state.status}
          busy={busy}
          canRebalance={Boolean(match)}
          onCheckIns={() => {
            setMenu(false);
            setCheckIns(true);
          }}
          onRebalance={() => {
            setMenu(false);
            doGenerate(true);
          }}
          onEndNight={() => {
            setMenu(false);
            run(() => openVoting(state.sessionId));
          }}
          onReopen={() => {
            setMenu(false);
            doReopen();
          }}
          onReset={() => {
            setMenu(false);
            setAskReset(true);
          }}
          onClose={() => setMenu(false)}
        />
      )}

      {askReset && (
        <ResetSheet
          checkedIn={checkedIn.length}
          round={state.round}
          busy={busy}
          onConfirm={doReset}
          onClose={() => setAskReset(false)}
        />
      )}

      {nextUp && (
        <NextUpSheet
          summary={nextUp.summary}
          teamA={nextUpMatch?.ok ? nextUpMatch.teamA : null}
          teamB={nextUpMatch?.ok ? nextUpMatch.teamB : null}
          missing={nextUpMatch && !nextUpMatch.ok ? nextUpMatch.missing : 0}
          busy={busy}
          onConfirm={doConfirmNext}
          onReshuffle={() => setNextUp({ ...nextUp, nonce: String(Date.now()) })}
          onClose={() => setNextUp(null)}
        />
      )}

      {checkIns && (
        <CheckInSheet
          players={state.players}
          onCourtIds={onCourt}
          busy={busy}
          onCheckIn={async (playerId) => {
            await checkIn(state.sessionId, playerId);
            await refresh();
          }}
          onUndoCheckIn={async (playerId) => {
            await undoCheckIn(state.sessionId, playerId);
            await refresh();
          }}
          onClose={() => setCheckIns(false)}
        />
      )}

      {askOrg && (
        <OrganizerSheet
          onSuccess={() => {
            setOrganizer(true);
            setOrg(true);
            setAskOrg(false);
            navigator.vibrate?.(30);
          }}
          onClose={() => setAskOrg(false)}
        />
      )}

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
