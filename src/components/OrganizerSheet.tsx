"use client";

import { useState } from "react";
import { Delete, X } from "lucide-react";

/**
 * PIN do organizador — com teclado PRÓPRIO, na tela.
 *
 * Playtest 01: no Android, o campo (`type=password` + `inputMode=numeric`
 * + `autocomplete=one-time-code`) abriu o teclado numérico, brigou com o
 * gerenciador de senhas e travou a digitação — o organizador teve que
 * copiar e colar o PIN pra conseguir entrar.
 *
 * A solução é a mesma do resto do app: não depender do teclado do
 * sistema. Dez botões grandes, em pé, no escuro, com areia na mão. E
 * como o teclado é nosso, o PIN é numérico por definição — não tem como
 * o aparelho abrir "o teclado errado".
 */
const MAX = 8;

export function OrganizerSheet({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const push = (d: string) => {
    setErr(null);
    setPin((v) => (v.length >= MAX ? v : v + d));
    navigator.vibrate?.(10);
  };

  const submit = async (value = pin) => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/organizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value.trim() }),
      });
      if (!res.ok) {
        setErr("PIN errado.");
        setPin("");
        return;
      }
      onSuccess();
    } catch {
      setErr("Sem rede. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  const keyCls =
    "font-display tnum bg-surface-2 text-ink flex h-16 items-center justify-center rounded-[12px] text-2xl font-bold active:bg-accent active:text-accent-ink";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border-border w-full max-w-[480px] rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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

        <p className="text-muted mb-4 text-sm">
          Com o PIN você gera partida, marca quem ganhou e ajusta a escala.
        </p>

        {/* os pontinhos mostram quantos dígitos já entraram, sem revelar o PIN */}
        <div
          className="bg-surface-2 border-border mb-3 flex h-14 items-center justify-center gap-3 rounded-[12px] border"
          aria-live="polite"
          aria-label={`${pin.length} dígitos`}
        >
          {pin.length === 0 ? (
            <span className="text-muted text-sm tracking-widest uppercase">
              digite o pin
            </span>
          ) : (
            Array.from({ length: pin.length }, (_, i) => (
              <span key={i} className="bg-accent size-3 rounded-full" />
            ))
          )}
        </div>

        {err && <p className="text-live mb-3 text-center text-sm">{err}</p>}

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => push(d)} className={keyCls}>
              {d}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin("")}
            className="font-display text-muted flex h-16 items-center justify-center rounded-[12px] text-sm tracking-widest uppercase"
          >
            limpar
          </button>
          <button type="button" onClick={() => push("0")} className={keyCls}>
            0
          </button>
          <button
            type="button"
            onClick={() => setPin((v) => v.slice(0, -1))}
            aria-label="Apagar"
            className="text-muted flex h-16 items-center justify-center rounded-[12px]"
          >
            <Delete className="size-6" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => submit()}
          disabled={busy || !pin}
          className="font-display bg-accent text-accent-ink mt-3 flex h-14 w-full items-center justify-center rounded-[12px] text-lg font-extrabold tracking-widest uppercase disabled:opacity-40"
        >
          {busy ? "conferindo…" : "entrar"}
        </button>
      </div>
    </div>
  );
}
