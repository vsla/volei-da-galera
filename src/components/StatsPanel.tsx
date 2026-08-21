"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import {
  fetchHeadToHead,
  fetchPeladaBySlug,
  fetchPlayerStats,
  type HeadToHead,
  type Pelada,
  type PlayerStats,
} from "@/lib/db";
import { getMe } from "@/lib/identity";

/**
 * OS NÚMEROS DA PELADA.
 *
 * O pedido do playtest foi específico e muito melhor que "estatísticas":
 * *"estatísticas que você pode montar, tipo 'ganhei todas de
 * fulaninho'"*. O que rende resenha no grupo não é a tabela — é o
 * confronto direto. Por isso o "eu × alguém" vem antes da lista.
 *
 * Nada aqui expõe contagem de votos por jogador (`RESUMO.md`): o que
 * aparece é quantas vezes a pessoa FOI destaque, que é o fato público.
 */
export function StatsPanel({ slug }: { slug: string }) {
  const router = useRouter();
  const [pelada, setPelada] = useState<Pelada | null | undefined>(undefined);
  const [stats, setStats] = useState<PlayerStats[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [other, setOther] = useState<string | null>(null);
  const [h2h, setH2h] = useState<HeadToHead | null>(null);

  const load = useCallback(async () => {
    const p = await fetchPeladaBySlug(slug);
    setPelada(p);
    if (p) setStats(await fetchPlayerStats(p.id));
  }, [slug]);

  useEffect(() => {
    setMeId(getMe());
    void load();
  }, [load]);

  useEffect(() => {
    if (!pelada || !meId || !other) {
      setH2h(null);
      return;
    }
    fetchHeadToHead(pelada.id, meId, other).then(setH2h).catch(() => setH2h(null));
  }, [pelada, meId, other]);

  if (pelada === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="text-4xl">🏐</span>
      </main>
    );
  }

  if (!pelada) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="font-display text-muted tracking-widest uppercase">
          Pelada não encontrada
        </p>
      </main>
    );
  }

  const me = stats.find((s) => s.playerId === meId);
  const otherName = stats.find((s) => s.playerId === other)?.name ?? "";
  const pct = (s: PlayerStats) =>
    s.games ? Math.round((s.wins / s.games) * 100) : 0;

  return (
    <main className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-4 pb-8">
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => router.push(`/p/${slug}`)}
          aria-label="Voltar pra quadra"
          className="text-muted -ml-2 flex size-12 items-center justify-center"
        >
          <ChevronLeft className="size-6" />
        </button>
        <h1 className="font-display text-ink min-w-0 flex-1 truncate text-xl font-extrabold tracking-widest uppercase">
          Números
        </h1>
      </div>

      {/* você */}
      {me && (
        <section className="bg-surface border-border mb-4 rounded-[16px] border px-4 py-4">
          <p className="font-display text-accent text-sm tracking-widest uppercase">
            {me.name}
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2 text-center">
            <Stat label="jogos" value={me.games} />
            <Stat label="vitórias" value={me.wins} />
            <Stat label="aprov." value={`${pct(me)}%`} />
            <Stat label="destaques" value={me.highlights} />
          </div>
        </section>
      )}

      {/* eu × alguém — o que rende resenha */}
      <section className="bg-surface border-border mb-4 rounded-[16px] border px-4 py-4">
        <p className="font-display text-ink text-sm tracking-widest uppercase">
          Eu × alguém
        </p>
        <p className="text-muted mb-3 text-xs">
          quantas vezes vocês jogaram juntos, quantas jogaram contra, e quem
          levou a melhor
        </p>

        <select
          value={other ?? ""}
          onChange={(e) => setOther(e.target.value || null)}
          className="bg-surface-2 border-border text-ink h-12 w-full rounded-[12px] border px-3 outline-none"
        >
          <option value="">escolha alguém…</option>
          {stats
            .filter((s) => s.playerId !== meId)
            .map((s) => (
              <option key={s.playerId} value={s.playerId}>
                {s.name}
              </option>
            ))}
        </select>

        {h2h && (
          <div className="mt-3 flex flex-col gap-2">
            <div className="bg-surface-2 rounded-[12px] px-3 py-2.5">
              <p className="text-muted text-xs tracking-widest uppercase">
                no mesmo time
              </p>
              <p className="font-display text-ink text-base">
                {h2h.gamesTogether === 0 ? (
                  "nunca jogaram juntos"
                ) : (
                  <>
                    <span className="tnum font-extrabold">{h2h.gamesTogether}</span>{" "}
                    {h2h.gamesTogether === 1 ? "partida" : "partidas"} —{" "}
                    <span className="tnum text-accent font-extrabold">
                      {h2h.winsTogether}
                    </span>{" "}
                    {h2h.winsTogether === 1 ? "vitória" : "vitórias"}
                  </>
                )}
              </p>
            </div>

            <div className="bg-surface-2 rounded-[12px] px-3 py-2.5">
              <p className="text-muted text-xs tracking-widest uppercase">
                um contra o outro
              </p>
              {h2h.gamesAgainst === 0 ? (
                <p className="font-display text-ink text-base">
                  nunca se enfrentaram
                </p>
              ) : (
                <>
                  <p className="font-display text-ink text-2xl font-extrabold">
                    <span className="tnum text-accent">{h2h.winsA}</span>
                    <span className="text-muted mx-2 text-lg">×</span>
                    <span className="tnum">{h2h.winsB}</span>
                  </p>
                  <p className="text-muted text-xs">
                    você × {otherName} · {h2h.gamesAgainst}{" "}
                    {h2h.gamesAgainst === 1 ? "partida" : "partidas"}
                    {h2h.winsB === 0 && " — você ganhou todas"}
                    {h2h.winsA === 0 && ` — ${otherName} ganhou todas`}
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* a tabela */}
      <h2 className="font-display text-muted mb-2 text-sm tracking-widest uppercase">
        A pelada inteira
      </h2>
      <ul className="flex flex-col gap-1">
        {stats.map((s, i) => (
          <li
            key={s.playerId}
            className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 ${
              s.playerId === meId ? "bg-accent/10 ring-accent/40 ring-1" : "bg-surface"
            }`}
          >
            <span className="font-display tnum text-muted w-5 text-center text-sm font-bold">
              {i + 1}
            </span>
            <span className="font-display text-ink min-w-0 flex-1 truncate text-base font-semibold tracking-wide uppercase">
              {s.name}
            </span>
            {s.highlights > 0 && (
              <span className="tnum text-accent text-sm">⭐{s.highlights}</span>
            )}
            <span className="tnum text-muted/70 text-sm">{pct(s)}%</span>
            <span className="tnum text-muted text-sm">{s.games}j</span>
          </li>
        ))}
      </ul>

      {stats.length === 0 && (
        <p className="text-muted py-8 text-center">
          Ainda não tem partida encerrada nesta pelada.
        </p>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="font-display tnum text-ink text-2xl font-extrabold">{value}</p>
      <p className="text-muted text-xs tracking-widest uppercase">{label}</p>
    </div>
  );
}
