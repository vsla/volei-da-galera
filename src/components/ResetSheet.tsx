"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Reset da noite — o botão que não pode ser fácil de apertar sem querer.
 *
 * Por isso a confirmação é escrita, não um "tem certeza?". Dois toques
 * errados no bolso não apagam a sexta; digitar RESETAR, sim.
 */
export function ResetSheet({
  checkedIn,
  round,
  busy,
  onConfirm,
  onClose,
}: {
  checkedIn: number;
  round: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === "RESETAR";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="bg-surface border-border max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            Resetar a noite
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

        <p className="text-muted mb-3">Vai embora, sem volta:</p>
        <ul className="text-ink mb-4 flex flex-col gap-1.5 text-sm">
          <li>
            • o check-in de {checkedIn} {checkedIn === 1 ? "pessoa" : "pessoas"}
          </li>
          <li>
            • {round} {round === 1 ? "partida" : "partidas"} e a contagem de jogos
            de todo mundo
          </li>
          <li>• quem está segurando a quadra agora</li>
          <li>• os votos e os Destaques desta data</li>
        </ul>
        <p className="text-muted mb-4 text-sm">
          Fica: os cadastros (inclusive convidados) e a nota de cada um, que é de
          todas as noites, não só de hoje.
        </p>

        <label
          htmlFor="reset-confirm"
          className="font-display text-muted mb-2 block text-sm tracking-widest uppercase"
        >
          Digite RESETAR pra confirmar
        </label>
        <input
          id="reset-confirm"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="bg-surface-2 text-ink border-border mb-3 h-14 w-full rounded-[12px] border px-3 text-lg tracking-widest uppercase"
        />

        <button
          type="button"
          onClick={onConfirm}
          disabled={!armed || busy}
          className="font-display bg-live h-14 w-full rounded-[12px] text-base font-bold tracking-widest text-white uppercase disabled:opacity-30"
        >
          Resetar a noite
        </button>
      </div>
    </div>
  );
}
