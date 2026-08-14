"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import type { SessionPlayer } from "@/lib/types";

const COLLAPSED = 6;

export function Queue({
  players,
  meId,
  onExplain,
  onPlayerTap,
}: {
  /** já ordenada pela fila: menos jogos → há mais tempo sem jogar → sorteio */
  players: SessionPlayer[];
  meId?: string | null;
  onExplain?: () => void;
  /** Organizador toca pra botar na quadra ou marcar que foi embora. */
  onPlayerTap?: (player: SessionPlayer) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = players.length - COLLAPSED;
  const shown = expanded ? players : players.slice(0, COLLAPSED);

  return (
    <section className="mt-6 px-4 pb-4">
      <div className="mb-2 flex items-center">
        <h2 className="font-display text-muted text-base font-bold tracking-widest uppercase">
          Próximos
        </h2>
        <button
          type="button"
          onClick={onExplain}
          aria-label="Por que esses jogadores"
          className="text-muted hover:text-accent -my-2 ml-auto flex size-12 items-center justify-center"
        >
          <HelpCircle className="size-5" />
        </button>
      </div>

      {players.length === 0 ? (
        <p className="text-muted py-6 text-center">Ninguém esperando.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {shown.map((p, i) => {
            const isMe = p.id === meId;
            const Row = onPlayerTap ? "button" : "div";
            return (
              <li key={p.id}>
                <Row
                  {...(onPlayerTap
                    ? { type: "button" as const, onClick: () => onPlayerTap(p) }
                    : {})}
                  className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left ${
                    isMe ? "bg-accent/10 ring-accent/40 ring-1" : "bg-surface"
                  }`}
                >
                <span className="font-display tnum text-muted w-5 text-center text-base font-bold">
                  {i + 1}
                </span>
                <span
                  className={`font-display flex-1 truncate text-base font-semibold tracking-wide uppercase ${
                    isMe ? "text-accent" : "text-ink"
                  }`}
                >
                  {isMe ? "você" : p.name}
                </span>
                <span className="tnum text-muted text-sm">
                  {p.gamesPlayed} {p.gamesPlayed === 1 ? "jogo" : "jogos"}
                </span>
                  {isMe && <span className="text-accent">◄</span>}
                </Row>
              </li>
            );
          })}
        </ol>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="font-display text-muted hover:text-ink h-12 w-full text-sm tracking-widest uppercase"
        >
          {expanded ? "▴ mostrar menos" : `▾ mostrar todos (${hidden})`}
        </button>
      )}
    </section>
  );
}
