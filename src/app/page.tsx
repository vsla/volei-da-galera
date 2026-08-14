"use client";

import { useEffect, useState } from "react";
import { useLiveSession } from "@/hooks/useLiveSession";
import { NamePicker } from "@/components/NamePicker";
import { Lobby } from "@/components/Lobby";
import { addGuest } from "@/lib/db";
import { getMe, setMe } from "@/lib/identity";

export default function Home() {
  const { state, loading, stale, refresh } = useLiveSession();
  const [meId, setMeId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // localStorage só existe no cliente — evita divergência com o SSR
  useEffect(() => {
    setMeId(getMe());
    setReady(true);
  }, []);

  const pick = (playerId: string) => {
    setMe(playerId);
    setMeId(playerId);
  };

  if (!ready || loading) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="text-4xl">🏐</span>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🏐</span>
        <p className="font-display text-muted text-lg tracking-widest uppercase">
          Ainda não abriu a lista de hoje
        </p>
      </main>
    );
  }

  // quem já escolheu o nome pula direto pro lobby
  if (!meId || !state.players.some((p) => p.id === meId)) {
    return (
      <NamePicker
        players={state.players}
        onPick={pick}
        onAddGuest={async (name) => {
          const id = await addGuest(name);
          await refresh();
          if (id) pick(id);
        }}
      />
    );
  }

  return <Lobby state={state} stale={stale} meId={meId} refresh={refresh} />;
}
