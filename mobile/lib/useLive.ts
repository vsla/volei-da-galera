import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMembers, fetchState, type LiveState, type Member, type Role } from "./db";

/**
 * A data de hoje em São Paulo, `YYYY-MM-DD`.
 *
 * O celular pode estar em qualquer fuso, mas a pelada é sempre no
 * horário de Brasília. Sem fixar isso, quem viaja abre o app e cria uma
 * sessão com a data errada — e a tela de check-in, que procura a sessão
 * de hoje, aparece vazia na beira da quadra às 21h. Foi o defeito (3)
 * do PRP v3.
 */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type Live = {
  state: LiveState | null;
  members: Member[];
  myRole: Role | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
};

/**
 * O estado da noite, recarregado sozinho.
 *
 * Poll a cada 5s em vez de realtime: são 25 celulares na praia numa
 * rede ruim, e um GET que falha e tenta de novo daqui a pouco é mais
 * previsível que um websocket que cai calado e deixa a tela mentindo.
 * O `inFlight` evita empilhar requisição quando a rede está lenta.
 */
export function useLive(peladaId: string | undefined, myPlayerId: string | undefined): Live {
  const [state, setState] = useState<LiveState | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!peladaId || inFlight.current) return;
    inFlight.current = true;
    try {
      const [s, m] = await Promise.all([fetchState(peladaId), fetchMembers(peladaId)]);
      setState(s);
      setMembers(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [peladaId]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  const myRole =
    (myPlayerId && members.find((m) => m.playerId === myPlayerId)?.role) || null;

  return {
    state,
    members,
    myRole,
    isAdmin: myRole === "owner" || myRole === "admin",
    loading,
    error,
    reload,
  };
}
