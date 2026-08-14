"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * PIN do organizador — sheet do app, sem o prompt nativo do browser.
 * Na areia o Chrome prompt é ilegível e fácil de cancelar sem querer.
 */
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async () => {
    if (busy || !pin.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/organizer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (!res.ok) {
        setErr("PIN errado.");
        setPin("");
        inputRef.current?.focus();
        return;
      }
      onSuccess();
    } catch {
      setErr("Sem rede. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border-border w-full max-w-[480px] rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center">
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

        <p className="text-muted mb-5 text-sm">
          Com o PIN você gera partida, marca quem ganhou e ajusta a escala.
        </p>

        <label
          htmlFor="org-pin"
          className="font-display text-muted mb-2 block text-sm tracking-widest uppercase"
        >
          PIN
        </label>
        <input
          ref={inputRef}
          id="org-pin"
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="bg-surface-2 text-ink border-border mb-3 h-14 w-full rounded-[12px] border px-4 text-center text-2xl tracking-[0.4em]"
          placeholder="••••"
        />

        {err && <p className="text-live mb-3 text-center text-sm">{err}</p>}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !pin.trim()}
            className="font-display bg-accent text-accent-ink flex h-14 items-center justify-center rounded-[12px] text-lg font-extrabold tracking-widest uppercase disabled:opacity-40"
          >
            {busy ? "conferindo…" : "entrar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="font-display text-muted h-12 text-sm tracking-widest uppercase"
          >
            cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
