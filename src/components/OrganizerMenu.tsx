"use client";

import { X } from "lucide-react";
import type { LiveState } from "@/lib/db";

/**
 * Tudo que só o organizador faz, atrás da engrenagem.
 *
 * Antes isso era uma pilha de botões soltos no fim da página, no mesmo
 * scroll da fila — quem só quer ver a posição na fila passava por cima
 * de "encerrar a noite" e "resetar". Ação rara e perigosa fica guardada;
 * o que é do jogo (re-sortear a partida) continua junto da quadra.
 *
 * Ordem deliberada: o que se usa toda sexta em cima, o irreversível
 * embaixo e separado.
 */
export function OrganizerMenu({
  status,
  busy,
  onCheckIns,
  onEndNight,
  onReopen,
  onReset,
  onClose,
}: {
  status: LiveState["status"];
  busy: boolean;
  onCheckIns: () => void;
  onEndNight: () => void;
  onReopen: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const ended = status === "voting" || status === "closed";

  const item =
    "font-display flex h-14 w-full items-center gap-3 rounded-[12px] px-3 text-base font-semibold tracking-widest uppercase disabled:opacity-40";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="bg-surface border-border max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            Organizador
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted -my-2 ml-auto flex size-12 items-center justify-center"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={onCheckIns}
            disabled={busy}
            className={`${item} bg-surface-2 text-ink`}
          >
            <span>✅</span> Check-in de outros
          </button>

          {ended ? (
            <button
              type="button"
              onClick={onReopen}
              disabled={busy}
              className={`${item} bg-surface-2 text-accent`}
            >
              <span>↩︎</span> Voltar pra quadra
            </button>
          ) : (
            <button
              type="button"
              onClick={onEndNight}
              disabled={busy}
              className={`${item} bg-surface-2 text-ink`}
            >
              <span>⭐</span> Encerrar e abrir os destaques
            </button>
          )}
        </div>

        {/* o irreversível mora sozinho, longe do polegar */}
        <div className="border-border mt-5 border-t pt-3">
          <button
            type="button"
            onClick={onReset}
            disabled={busy}
            className={`${item} text-live`}
          >
            <span>⟲</span> Resetar a noite
          </button>
        </div>
      </div>
    </div>
  );
}
