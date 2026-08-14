"use client";

import { useMemo, useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { initials, type SessionPlayer } from "@/lib/types";

export function NamePicker({
  players,
  onPick,
  onAddGuest,
}: {
  players: SessionPlayer[];
  onPick: (playerId: string) => void;
  onAddGuest: (name: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [guest, setGuest] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return players;
    return players.filter((p) => p.name.toLowerCase().includes(needle));
  }, [players, q]);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-10 pb-6">
      <div className="mb-8 text-center">
        <div className="text-5xl">🏐</div>
        <h1 className="font-display text-ink mt-2 text-3xl font-extrabold tracking-widest uppercase">
          Prainha ZN
        </h1>
        <p className="font-display text-muted mt-4 text-lg tracking-widest uppercase">
          Quem é você?
        </p>
      </div>

      <div className="bg-surface border-border mb-4 flex items-center gap-3 rounded-[12px] border px-4">
        <Search className="text-muted size-5 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="buscar nome..."
          className="text-ink placeholder:text-muted h-12 w-full bg-transparent outline-none"
        />
      </div>

      <ul className="grid grid-cols-2 gap-2">
        {filtered.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.id)}
              className="bg-surface border-border active:border-accent active:bg-accent/10 flex min-h-[64px] w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left"
            >
              <span className="bg-surface-2 font-display text-muted flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                {initials(p.name)}
              </span>
              <span className="font-display text-ink truncate text-base font-semibold tracking-wide uppercase">
                {p.name}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <p className="text-muted py-8 text-center">
          Ninguém com esse nome. Entra como convidado.
        </p>
      )}

      <div className="mt-6">
        {adding ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!guest.trim() || busy) return;
              setBusy(true);
              await onAddGuest(guest.trim());
              setBusy(false);
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={guest}
              onChange={(e) => setGuest(e.target.value)}
              placeholder="seu nome"
              className="bg-surface border-border text-ink placeholder:text-muted h-14 flex-1 rounded-[12px] border px-4 outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="font-display bg-accent text-accent-ink h-14 rounded-[12px] px-5 text-base font-extrabold tracking-widest uppercase disabled:opacity-50"
            >
              {busy ? "..." : "entrar"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="font-display text-muted border-border hover:text-ink flex h-14 w-full items-center justify-center gap-2 rounded-[12px] border border-dashed text-base tracking-widest uppercase"
          >
            <UserPlus className="size-5" />
            Sou convidado
          </button>
        )}
      </div>
    </main>
  );
}
