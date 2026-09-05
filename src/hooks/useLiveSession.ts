"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { fetchState, type LiveState } from "@/lib/db";

const TABLES = [
  "sessions",
  "session_players",
  "matches",
  "match_players",
  "pelada_members",
];
/** Rede de praia cai. O polling é o que segura quando o realtime some. */
const POLL_MS = 5000;
/** Depois disso, a tela avisa que o que está ali é estado velho. */
const STALE_MS = 20000;

/**
 * O estado ao vivo de UMA pelada.
 *
 * Antes o hook lia "a sessão mais recente do banco", que só fazia
 * sentido com uma pelada no mundo (v1). Agora a pelada é parâmetro — e
 * o canal do realtime é por pelada, senão o vôlei de domingo acorda o
 * celular de quem está jogando na sexta.
 */
export function useLiveSession(peladaId: string | null) {
  const [state, setState] = useState<LiveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  /**
   * A última leitura falhou.
   *
   * Sem isto, `state === null` quer dizer duas coisas opostas — "esta
   * pelada não tem noite aberta" e "não consegui perguntar" — e a tela
   * tratava as duas como a primeira.
   */
  const [failed, setFailed] = useState(false);
  const lastOk = useRef(Date.now());

  const refresh = useCallback(async () => {
    if (!peladaId) return;
    try {
      const next = await fetchState(peladaId);
      setState(next);
      lastOk.current = Date.now();
      setStale(false);
      setFailed(false);
    } catch {
      // mantém o estado anterior na tela — nunca apaga o que a
      // pessoa está olhando por causa de uma falha de rede
      setStale(Date.now() - lastOk.current > STALE_MS);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [peladaId]);

  useEffect(() => {
    if (!peladaId) {
      setLoading(false);
      return;
    }
    refresh();

    const channel = supabase.channel(`volei-live:${peladaId}`);
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
  }, [refresh, peladaId]);

  return { state, loading, stale, failed, refresh };
}
