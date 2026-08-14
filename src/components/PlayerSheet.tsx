"use client";

import { useState } from "react";
import { ArrowLeftRight, DoorOpen, Undo2, X } from "lucide-react";
import type { SessionPlayer, Team } from "@/lib/types";

export type PlayerContext =
  | { where: "court"; team: Team }
  | { where: "queue" }
  | { where: "gone" };

/**
 * Uma folha só resolve todos os casos que aparecem na areia:
 * trocar por alguém da fila, passar de time, e "foi embora".
 *
 * A troca é a operação principal — é o que cobre "o sorteado saiu",
 * "alguém precisa vazar no meio do jogo" e "quero ajustar o time".
 */
export function PlayerSheet({
  player,
  context,
  queue,
  onSwap,
  onMove,
  onLeave,
  onRejoin,
  onClose,
}: {
  player: SessionPlayer;
  context: PlayerContext;
  /** Quem pode entrar no lugar, já na ordem da fila. */
  queue: SessionPlayer[];
  onSwap: (inPlayerId: string) => void;
  onMove: (team: Team) => void;
  onLeave: (replacementId: string | null) => void;
  onRejoin: () => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);

  const onCourt = context.where === "court";
  const gone = context.where === "gone";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="bg-surface border-border max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="font-display text-ink truncate text-xl font-extrabold tracking-widest uppercase">
            {player.name}
          </h2>
          <span className="tnum text-muted shrink-0 text-sm">
            {player.gamesPlayed} {player.gamesPlayed === 1 ? "jogo" : "jogos"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted -my-2 ml-auto flex size-12 shrink-0 items-center justify-center"
          >
            <X className="size-5" />
          </button>
        </div>

        {picking ? (
          <>
            <p className="text-muted mb-3">
              Quem entra no lugar? {onCourt && "Ele volta pra fila sem perder a vez."}
            </p>
            {queue.length === 0 ? (
              <p className="text-muted py-6 text-center">Não tem ninguém na fila.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {queue.map((p, i) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => onSwap(p.id)}
                      className="bg-surface-2 active:bg-accent/15 flex min-h-[56px] w-full items-center gap-3 rounded-[12px] px-3 text-left"
                    >
                      <span className="font-display tnum text-muted w-5 text-center font-bold">
                        {i + 1}
                      </span>
                      <span className="font-display text-ink flex-1 truncate text-base font-semibold tracking-wide uppercase">
                        {p.name}
                      </span>
                      <span className="tnum text-muted text-sm">{p.gamesPlayed}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="font-display text-muted h-12 w-full text-sm tracking-widest uppercase"
            >
              voltar
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {gone ? (
              <Action icon={<Undo2 className="size-5" />} onClick={onRejoin}>
                Voltou — botar de novo na fila
              </Action>
            ) : (
              <>
                {onCourt && (
                  <Action
                    icon={<ArrowLeftRight className="size-5" />}
                    onClick={() => setPicking(true)}
                  >
                    Trocar por alguém da fila
                  </Action>
                )}

                {onCourt && context.where === "court" && (
                  <Action
                    icon={<ArrowLeftRight className="size-5 rotate-90" />}
                    onClick={() => onMove(context.team === "A" ? "B" : "A")}
                  >
                    Passar pro time {context.team === "A" ? "B" : "A"}
                  </Action>
                )}

                {!onCourt && (
                  <Action
                    icon={<ArrowLeftRight className="size-5" />}
                    onClick={() => setPicking(true)}
                  >
                    Botar na quadra no lugar de alguém
                  </Action>
                )}

                <Action
                  icon={<DoorOpen className="size-5" />}
                  danger
                  onClick={() => onLeave(onCourt ? (queue[0]?.id ?? null) : null)}
                >
                  Foi embora
                  {onCourt && queue[0] && (
                    <span className="text-muted block text-sm normal-case">
                      {queue[0].name} assume a vaga
                    </span>
                  )}
                </Action>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Action({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-display bg-surface-2 flex min-h-[56px] w-full items-center gap-3 rounded-[12px] px-4 py-3 text-left text-base font-semibold tracking-wide uppercase ${
        danger ? "text-live" : "text-ink"
      }`}
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1">{children}</span>
    </button>
  );
}
