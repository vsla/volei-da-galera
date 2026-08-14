"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { initials, type SessionPlayer } from "@/lib/types";

/**
 * Check-in em nome de outra pessoa.
 *
 * Na praia o celular passa de mão em mão — ou alguém chega sem
 * aparelho. O organizador marca a chegada aqui, pela engrenagem.
 */
export function CheckInSheet({
  players,
  onCourtIds,
  busy,
  onCheckIn,
  onUndoCheckIn,
  onClose,
}: {
  players: SessionPlayer[];
  /** Quem já está em quadra — não dá pra desfazer o check-in. */
  onCourtIds: Set<string>;
  busy?: boolean;
  onCheckIn: (playerId: string) => Promise<void>;
  onUndoCheckIn: (playerId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [working, setWorking] = useState<string | null>(null);

  const needle = q.trim().toLowerCase();
  const match = (p: SessionPlayer) =>
    !needle || p.name.toLowerCase().includes(needle);

  const awaiting = useMemo(
    () =>
      players
        .filter((p) => p.checkedInAt === null && !p.excluded)
        .filter(match)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, needle],
  );

  const arrived = useMemo(
    () =>
      players
        .filter(
          (p) =>
            p.checkedInAt !== null && !p.excluded && !onCourtIds.has(p.id),
        )
        .filter(match)
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, needle, onCourtIds],
  );

  const run = async (id: string, fn: () => Promise<void>) => {
    if (busy || working) return;
    setWorking(id);
    try {
      await fn();
      navigator.vibrate?.(30);
    } finally {
      setWorking(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border-border flex max-h-[85dvh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[16px] border-t">
        <div className="flex shrink-0 items-center px-4 pt-4">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            Check-in
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

        <p className="text-muted shrink-0 px-4 pt-1 pb-3 text-sm">
          Marca quem chegou sem celular — ou desfaz se errou o nome.
        </p>

        <div className="bg-surface-2 border-border mx-4 mb-3 flex shrink-0 items-center gap-3 rounded-[12px] border px-4">
          <Search className="text-muted size-5 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="buscar nome..."
            className="text-ink placeholder:text-muted h-12 w-full bg-transparent outline-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <h3 className="font-display text-muted mb-2 text-sm tracking-widest uppercase">
            Ainda não chegaram ({awaiting.length})
          </h3>
          {awaiting.length === 0 ? (
            <p className="text-muted mb-6 py-4 text-center text-sm">
              {needle ? "Ninguém com esse nome." : "Todo mundo já fez check-in."}
            </p>
          ) : (
            <ul className="mb-6 flex flex-col gap-1.5">
              {awaiting.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={Boolean(working) || busy}
                    onClick={() => run(p.id, () => onCheckIn(p.id))}
                    className="bg-surface-2 border-border active:border-accent active:bg-accent/10 flex min-h-[56px] w-full items-center gap-3 rounded-[12px] border px-3 text-left disabled:opacity-40"
                  >
                    <span className="bg-surface font-display text-muted flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                      {initials(p.name)}
                    </span>
                    <span className="font-display text-ink flex-1 truncate text-base font-semibold tracking-wide uppercase">
                      {p.name}
                    </span>
                    <span className="font-display text-accent text-xs tracking-widest uppercase">
                      {working === p.id ? "…" : "+ chegou"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {arrived.length > 0 && (
            <>
              <h3 className="font-display text-muted mb-2 text-sm tracking-widest uppercase">
                Na praia ({arrived.length})
              </h3>
              <ul className="flex flex-col gap-1.5">
                {arrived.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={Boolean(working) || busy}
                      onClick={() => run(p.id, () => onUndoCheckIn(p.id))}
                      className="bg-surface-2 border-border active:border-live/60 flex min-h-[56px] w-full items-center gap-3 rounded-[12px] border px-3 text-left disabled:opacity-40"
                    >
                      <span className="bg-accent/15 font-display text-accent flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                        ✓
                      </span>
                      <span className="font-display text-ink flex-1 truncate text-base font-semibold tracking-wide uppercase">
                        {p.name}
                      </span>
                      <span className="font-display text-muted text-xs tracking-widest uppercase">
                        {working === p.id ? "…" : "desfazer"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
