import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { useLive, type Live } from "./useLive";

export type GrupoInfo = {
  id: string;
  name: string;
  slug: string;
  joinCode: string | null;
  weekday: number | null;
  archived: boolean;
};

type Value = Live & {
  grupo: GrupoInfo | null;
  myPlayerId: string | null;
  isOwner: boolean;
  /** Recarrega só o cabeçalho do grupo — nome, dia, código. */
  reloadGrupo(): Promise<void>;
};

const Ctx = createContext<Value | null>(null);

/**
 * Um poll só para as três abas.
 *
 * Se cada aba chamasse `useLive`, trocar de aba significaria três
 * timers batendo no banco ao mesmo tempo e três versões do placar na
 * memória. O provider fica no layout das abas, acima delas.
 */
export function GrupoProvider({
  peladaId,
  children,
}: {
  peladaId: string;
  children: React.ReactNode;
}) {
  const { me } = useAuth();
  const live = useLive(peladaId, me?.playerId);
  const [grupo, setGrupo] = useState<GrupoInfo | null>(null);

  const reloadGrupo = useCallback(async () => {
    const { data } = await supabase
      .from("peladas")
      .select("id, name, slug, join_code, weekday, archived_at")
      .eq("id", peladaId)
      .maybeSingle();
    if (!data) return;
    setGrupo({
      id: data.id as string,
      name: data.name as string,
      slug: data.slug as string,
      joinCode: (data.join_code as string) ?? null,
      weekday: (data.weekday as number) ?? null,
      archived: data.archived_at != null,
    });
  }, [peladaId]);

  useEffect(() => {
    void reloadGrupo();
  }, [reloadGrupo]);

  return (
    <Ctx.Provider
      value={{
        ...live,
        grupo,
        myPlayerId: me?.playerId ?? null,
        isOwner: live.myRole === "owner",
        reloadGrupo,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useGrupo(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGrupo fora do GrupoProvider");
  return v;
}
