"use client";

import { X } from "lucide-react";

/**
 * Confirmação de um toque só, pra ações que doem se acontecerem sem querer.
 *
 * A tela é operada em pé, no escuro, com o celular na mão e areia em
 * tudo — encostar sem querer é o caso normal, não a exceção. Ações
 * críticas (finalizar partida, encerrar a noite, refazer os times)
 * passam por aqui.
 *
 * O botão de confirmar fica à DIREITA e o de cancelar à esquerda, e o
 * texto diz o que vai acontecer, não "OK". Quem lê "Time A venceu" sabe
 * o que está confirmando sem precisar lembrar o que apertou.
 *
 * Pro reset da noite, que é irreversível, a confirmação é mais dura —
 * digitar RESETAR (ver `ResetSheet`).
 */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  tone = "normal",
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  /** `danger` = vermelho, pra quando desfaz trabalho já feito. */
  tone?: "normal" | "danger";
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirmClass =
    tone === "danger"
      ? "bg-live text-white"
      : "bg-accent text-accent-ink";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70">
      <div className="bg-surface border-border w-full max-w-[480px] rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-2 flex items-start">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-muted -my-2 ml-auto flex size-12 shrink-0 items-center justify-center"
          >
            <X className="size-5" />
          </button>
        </div>

        {body && <p className="text-muted mb-4 text-sm">{body}</p>}

        <div className="grid grid-cols-[1fr_1.4fr] gap-2">
          <button
            type="button"
            onClick={onClose}
            className="font-display border-border text-muted h-14 rounded-[12px] border text-base tracking-widest uppercase"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`font-display h-14 rounded-[12px] text-base font-bold tracking-widest uppercase disabled:opacity-40 ${confirmClass}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
