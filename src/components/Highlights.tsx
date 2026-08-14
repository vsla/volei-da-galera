"use client";

import { useEffect, useState } from "react";
import { initials, type SessionPlayer } from "@/lib/types";
import {
  castVotes,
  closeVoting,
  fetchHighlights,
  myVotes,
  VOTES_PER_PLAYER,
  type HighlightResult,
  type LiveState,
} from "@/lib/db";

/**
 * Destaques do Dia.
 *
 * Cada um escolhe até 3. Voto é privado e a contagem NUNCA aparece —
 * a graça é a brincadeira, não um ranking de popularidade.
 */
export function Highlights({
  state,
  meId,
  isOrganizer,
  onBack,
  refresh,
}: {
  state: LiveState;
  meId: string;
  isOrganizer: boolean;
  onBack: () => void;
  refresh: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [voted, setVoted] = useState(false);
  const [result, setResult] = useState<HighlightResult | null>(null);
  const [busy, setBusy] = useState(false);

  const candidates = state.players
    .filter((p) => p.checkedInAt !== null && p.id !== meId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  useEffect(() => {
    myVotes(state.sessionId, meId).then((ids) => {
      if (ids.length) {
        setPicked(ids);
        setVoted(true);
      }
    });
  }, [state.sessionId, meId]);

  useEffect(() => {
    if (state.status !== "closed") return;
    fetchHighlights(state.sessionId, state.players).then(setResult);
  }, [state.status, state.sessionId, state.players]);

  const toggle = (id: string) =>
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= VOTES_PER_PLAYER
          ? cur
          : [...cur, id],
    );

  // ── resultado ──────────────────────────────────────────────
  if (state.status === "closed") {
    return (
      <main className="flex flex-1 flex-col px-4 pt-10 pb-6">
        <h1 className="font-display text-ink mb-8 text-center text-2xl font-extrabold tracking-widest uppercase">
          🏆 Destaques de hoje
        </h1>

        <ul className="flex flex-col gap-3">
          {(result?.winners ?? []).map((p) => (
            <li
              key={p.id}
              className="bg-surface border-border flex items-center gap-4 rounded-[16px] border px-5 py-6"
            >
              <span className="text-3xl">⭐</span>
              <span className="font-display text-ink truncate text-xl font-extrabold tracking-widest uppercase">
                {p.name}
              </span>
            </li>
          ))}
        </ul>

        {result && result.winners.length === 0 && (
          <p className="text-muted py-10 text-center">Ninguém votou hoje.</p>
        )}

        <p className="text-muted mt-10 text-center">
          Valeu, galera ❤️
          <br />
          Até sexta!
        </p>

        <button
          type="button"
          onClick={() => {
            const nomes = (result?.winners ?? []).map((p) => `⭐ ${p.name}`).join("\n");
            navigator.clipboard?.writeText(`🏆 Destaques de hoje\n\n${nomes}`);
          }}
          className="font-display text-muted mt-6 h-12 text-sm tracking-widest uppercase"
        >
          📋 copiar pro zap
        </button>

        <button
          type="button"
          onClick={onBack}
          className="font-display text-muted mt-2 h-12 text-sm tracking-widest uppercase"
        >
          voltar
        </button>
      </main>
    );
  }

  // ── votação ────────────────────────────────────────────────
  return (
    <main className="flex flex-1 flex-col px-4 pt-8 pb-6">
      <h1 className="font-display text-ink text-center text-2xl font-extrabold tracking-widest uppercase">
        ⭐ Destaques do dia
      </h1>
      <p className="text-muted mt-3 mb-6 text-center">
        Escolha até {VOTES_PER_PLAYER}. Jogada, resenha, disposição, evolução —
        o que você quiser.
      </p>

      <ul className="grid grid-cols-2 gap-2">
        {candidates.map((p) => {
          const on = picked.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={`flex min-h-[64px] w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left ${
                  on
                    ? "border-accent bg-accent/10"
                    : "bg-surface border-border"
                }`}
              >
                <span
                  className={`font-display flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    on ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
                  }`}
                >
                  {on ? "✓" : initials(p.name)}
                </span>
                <span className="font-display text-ink truncate text-base font-semibold tracking-wide uppercase">
                  {p.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="font-display tnum text-muted mt-4 text-center tracking-widest">
        {picked.length} / {VOTES_PER_PLAYER}
      </p>

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={busy || picked.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await castVotes(state.sessionId, meId, picked);
              setVoted(true);
            } finally {
              setBusy(false);
            }
          }}
          className="font-display bg-accent text-accent-ink flex h-14 items-center justify-center rounded-[12px] text-lg font-extrabold tracking-widest uppercase disabled:opacity-40"
        >
          {voted ? "voto salvo ✓" : "votar"}
        </button>

        {isOrganizer && (
          <button
            type="button"
            onClick={async () => {
              await closeVoting(state.sessionId);
              await refresh();
            }}
            className="font-display text-muted h-12 text-sm tracking-widest uppercase"
          >
            encerrar votação e revelar
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          className="font-display text-muted h-12 text-sm tracking-widest uppercase"
        >
          voltar
        </button>
      </div>
    </main>
  );
}
