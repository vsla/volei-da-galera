"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Minus, Plus, WifiOff, X } from "lucide-react";
import { bumpScore, resetScore } from "@/lib/db";
import { DEFAULT_TEAM_LABELS, type TeamLabels } from "@/lib/teams";
import type { Team } from "@/lib/types";

/**
 * PLACAR — a tela que fica na mão de quem está de fora marcando ponto.
 *
 * O `RESUMO.md` decidiu "1 toque, sem placar", e essa decisão continua
 * valendo pro caminho normal: ninguém digita ponto no meio do jogo. Esta
 * tela é pra outra situação — alguém sentado, fora da quadra, marcando.
 * Por isso ela é OPCIONAL e o botão "AZUL ganhou / LARANJA ganhou"
 * continua lá.
 *
 * DESDE O PLAYTEST 01: o placar mora no BANCO, não no localStorage.
 * Antes só quem marcava via o número; qualquer outro aparelho abria
 * 0×0. Agora:
 *
 *   - o ponto é incrementado dentro do banco (`bump_score`), então dois
 *     marcadores ao mesmo tempo somam em vez de se sobrescrever;
 *   - o toque é otimista: o número sobe na hora, sem esperar a rede;
 *   - se a rede cair, o delta fica pendente e é reenviado sozinho — a
 *     tela avisa que ainda não salvou.
 */

function elapsed(from: number, now: number): string {
  const total = Math.max(0, Math.floor((now - from) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function Side({
  team,
  label,
  score,
  onAdd,
  onSub,
}: {
  team: Team;
  label: string;
  score: number;
  onAdd: () => void;
  onSub: () => void;
}) {
  const bg = team === "A" ? "bg-team-a" : "bg-team-b";

  return (
    <div className={`${bg} relative flex flex-1 flex-col items-center justify-center gap-4 py-6`}>
      <h2 className="font-display absolute top-4 text-xl font-extrabold tracking-widest text-black/70 uppercase">
        {label}
      </h2>

      <button
        type="button"
        onClick={onAdd}
        aria-label={`Ponto para o time ${label}`}
        className="flex size-20 items-center justify-center rounded-full bg-white/25 active:bg-white/40"
      >
        <Plus className="size-10 text-white" strokeWidth={3} />
      </button>

      {/* o número precisa ser lido de longe, no escuro */}
      <span className="font-display tnum text-[22vh] leading-none font-extrabold text-white landscape:text-[30vh]">
        {score}
      </span>

      <button
        type="button"
        onClick={onSub}
        aria-label={`Tirar ponto do time ${label}`}
        className="flex size-16 items-center justify-center rounded-full bg-black/20 active:bg-black/35"
      >
        <Minus className="size-8 text-white" strokeWidth={3} />
      </button>
    </div>
  );
}

export function Scoreboard({
  matchId,
  startedAt,
  scoreA,
  scoreB,
  busy,
  labels = DEFAULT_TEAM_LABELS,
  canEdit = true,
  onFinish,
  onClose,
}: {
  matchId: string;
  /** Início da partida, pro cronômetro. */
  startedAt: string | null;
  /** Placar do banco — a fonte da verdade, igual pra todo aparelho. */
  scoreA: number;
  scoreB: number;
  busy: boolean;
  labels?: TeamLabels;
  /** Sem permissão, a tela vira painel: número grande, sem botões. */
  canEdit?: boolean;
  onFinish: (winner: Team, score: { a: number; b: number }) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  /** O que a tela mostra enquanto o banco não confirma. */
  const [local, setLocal] = useState<{ a: number; b: number } | null>(null);
  /** Deltas que a rede engoliu, esperando reenvio. */
  const pending = useRef<{ A: number; B: number }>({ A: 0, B: 0 });
  const [offline, setOffline] = useState(false);
  const inflight = useRef(0);

  const shown = local ?? { a: scoreA, b: scoreB };

  // o banco mandou número novo (outro aparelho marcou) e não temos nada
  // em voo: adota. Com toque em voo, o otimista local manda — senão o
  // número pisca pra trás no meio do ponto.
  useEffect(() => {
    if (inflight.current === 0 && pending.current.A === 0 && pending.current.B === 0) {
      setLocal(null);
    }
  }, [scoreA, scoreB]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const send = async (team: Team, delta: number) => {
    inflight.current++;
    try {
      const r = await bumpScore(matchId, team, delta);
      if (r) setLocal(r);
      if (pending.current.A === 0 && pending.current.B === 0) setOffline(false);
    } catch {
      // 4G de praia: guarda o ponto e tenta de novo sozinho
      pending.current[team] += delta;
      setOffline(true);
    } finally {
      inflight.current--;
    }
  };

  // reenvio do que ficou pendente
  useEffect(() => {
    const t = setInterval(() => {
      const p = pending.current;
      for (const team of ["A", "B"] as const) {
        if (p[team] === 0) continue;
        const delta = p[team];
        p[team] = 0;
        void send(team, delta);
      }
    }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  const bump = (team: Team, delta: number) => () => {
    const next = {
      a: team === "A" ? Math.max(0, shown.a + delta) : shown.a,
      b: team === "B" ? Math.max(0, shown.b + delta) : shown.b,
    };
    setLocal(next);
    navigator.vibrate?.(20);
    void send(team, delta);
  };

  const from = startedAt ? Date.parse(startedAt) : now;
  // empate não fecha: nossa rotação precisa saber quem fica na quadra
  const tied = shown.a === shown.b;
  const winner: Team = shown.a > shown.b ? "A" : "B";

  return (
    <div className="bg-bg fixed inset-0 z-50 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <Clock className="text-muted size-5" />
        <span className="font-display tnum text-ink text-xl font-bold">
          {elapsed(from, now)}
        </span>
        {offline && (
          <span className="text-live flex items-center gap-1.5 text-xs">
            <WifiOff className="size-4" />
            <span className="tracking-widest uppercase">salvando…</span>
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar placar"
          className="text-muted -my-2 ml-auto flex size-12 items-center justify-center"
        >
          <X className="size-6" />
        </button>
      </div>

      {/* dois lados, um por time — funciona em pé e deitado */}
      <div className="flex flex-1 overflow-hidden">
        <Side
          team="A"
          label={labels.A}
          score={shown.a}
          onAdd={canEdit ? bump("A", 1) : () => {}}
          onSub={canEdit ? bump("A", -1) : () => {}}
        />
        <Side
          team="B"
          label={labels.B}
          score={shown.b}
          onAdd={canEdit ? bump("B", 1) : () => {}}
          onSub={canEdit ? bump("B", -1) : () => {}}
        />
      </div>

      {canEdit ? (
        <div className="grid grid-cols-[auto_1fr] gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              setLocal({ a: 0, b: 0 });
              void resetScore(matchId).catch(() => setOffline(true));
            }}
            className="font-display border-border text-muted h-14 rounded-[12px] border px-5 text-base tracking-widest uppercase"
          >
            Zerar
          </button>
          <button
            type="button"
            onClick={() => onFinish(winner, { a: shown.a, b: shown.b })}
            disabled={tied || busy}
            className="font-display bg-accent text-accent-ink h-14 rounded-[12px] text-base font-bold tracking-widest uppercase disabled:opacity-30"
          >
            {tied ? "empate não fecha" : `${labels[winner]} venceu — finalizar`}
          </button>
        </div>
      ) : (
        <p className="text-muted px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-sm">
          Quem marca o ponto é o organizador. Aqui você acompanha ao vivo.
        </p>
      )}
    </div>
  );
}
