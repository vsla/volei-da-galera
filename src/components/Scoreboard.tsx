"use client";

import { useEffect, useRef, useState } from "react";
import { Clock, Minus, Plus, X } from "lucide-react";
import type { Team } from "@/lib/types";

/**
 * PLACAR — a tela que fica na mão de quem está de fora marcando ponto.
 *
 * O `RESUMO.md` decidiu "1 toque, sem placar", e essa decisão continua
 * valendo pro caminho normal: ninguém digita ponto no meio do jogo. Esta
 * tela é pra outra situação — alguém sentado, fora da quadra, marcando.
 * Por isso ela é OPCIONAL e o botão "A ganhou / B ganhou" continua lá.
 *
 * Desenho: dois lados, alvos gigantes, número enorme. Funciona com o
 * celular em pé ou deitado, e é legível de longe à noite — que é o que
 * a gente precisa na areia.
 *
 * O ponto some se o celular travar? Não: o placar é salvo no
 * localStorage por partida, então recarregar não perde nada.
 */

const key = (matchId: string) => `placar:${matchId}`;

function elapsed(from: number, now: number): string {
  const total = Math.max(0, Math.floor((now - from) / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function Side({
  team,
  score,
  onAdd,
  onSub,
}: {
  team: Team;
  score: number;
  onAdd: () => void;
  onSub: () => void;
}) {
  const bg = team === "A" ? "bg-team-a" : "bg-team-b";

  return (
    <div className={`${bg} relative flex flex-1 flex-col items-center justify-center gap-4 py-6`}>
      <h2 className="font-display absolute top-4 text-xl font-extrabold tracking-widest text-black/70 uppercase">
        Time {team}
      </h2>

      <button
        type="button"
        onClick={onAdd}
        aria-label={`Ponto para o time ${team}`}
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
        aria-label={`Tirar ponto do time ${team}`}
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
  busy,
  onFinish,
  onClose,
}: {
  matchId: string;
  /** Início da partida, pro cronômetro. */
  startedAt: string | null;
  busy: boolean;
  onFinish: (winner: Team, score: { a: number; b: number }) => void;
  onClose: () => void;
}) {
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const loaded = useRef(false);

  // recupera o placar desta partida (celular travou, aba recarregou)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key(matchId));
      if (raw) {
        const saved = JSON.parse(raw) as { a: number; b: number };
        setA(saved.a ?? 0);
        setB(saved.b ?? 0);
      }
    } catch {
      // localStorage cheio ou bloqueado: o placar só não persiste
    }
    loaded.current = true;
  }, [matchId]);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(key(matchId), JSON.stringify({ a, b }));
    } catch {
      // idem
    }
  }, [matchId, a, b]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const from = startedAt ? Date.parse(startedAt) : now;
  // empate não fecha: nossa rotação precisa saber quem fica na quadra
  const tied = a === b;
  const winner: Team = a > b ? "A" : "B";

  const bump = (set: (fn: (v: number) => number) => void, delta: number) => () => {
    set((v) => Math.max(0, v + delta));
    navigator.vibrate?.(20);
  };

  return (
    <div className="bg-bg fixed inset-0 z-50 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3">
        <Clock className="text-muted size-5" />
        <span className="font-display tnum text-ink text-xl font-bold">
          {elapsed(from, now)}
        </span>
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
        <Side team="A" score={a} onAdd={bump(setA, 1)} onSub={bump(setA, -1)} />
        <Side team="B" score={b} onAdd={bump(setB, 1)} onSub={bump(setB, -1)} />
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-2 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            setA(0);
            setB(0);
          }}
          className="font-display border-border text-muted h-14 rounded-[12px] border px-5 text-base tracking-widest uppercase"
        >
          Zerar
        </button>
        <button
          type="button"
          onClick={() => onFinish(winner, { a, b })}
          disabled={tied || busy}
          className="font-display bg-accent text-accent-ink h-14 rounded-[12px] text-base font-bold tracking-widest uppercase disabled:opacity-30"
        >
          {tied ? "empate não fecha" : `Time ${winner} venceu — finalizar`}
        </button>
      </div>
    </div>
  );
}
