"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchState, type LiveState } from "@/lib/db";

const TABLES = ["sessions", "session_players", "matches", "match_players"];
/** Rede de praia cai. O polling é o que segura quando o realtime some. */
const POLL_MS = 5000;
/** Depois disso, a tela avisa que o que está ali é estado velho. */
const STALE_MS = 20000;

export function useLiveSession() {
  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const lastOk = useRef(Date.now());

  const refresh = useCallback(async () => {
    try {
      const next = await fetchState();
      setState(next);
      lastOk.current = Date.now();
      setStale(false);
    } catch {
      // mantém o estado anterior na tela — nunca apaga o que a
      // pessoa está olhando por causa de uma falha de rede
      setStale(Date.now() - lastOk.current > STALE_MS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const channel = supabase.channel("volei-live");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () =>
        refresh(),
      );
    }
    channel.subscribe();

    const poll = setInterval(() => {
      refresh();
      if (Date.now() - lastOk.current > STALE_MS) setStale(true);
    }, POLL_MS);

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  return { state, loading, stale, refresh };
}
