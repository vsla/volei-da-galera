"use client";

import { Flame, X } from "lucide-react";
import type { FinishSummary } from "@/lib/db";
import { courtNames, type SessionPlayer, type Team } from "@/lib/types";

/**
 * A tela entre uma partida e a outra.
 *
 * Sem ela, o organizador aperta "A ganhou", a quadra fica vazia, e
 * ninguém sabe quem fica, quem sai e quem entra até o próximo sorteio
 * aparecer pronto. Pior: quando o vencedor bate o teto de vitórias,
 * quem PERDEU é que segura a quadra — sem explicação isso parece bug,
 * e discussão na areia é o que o site existe pra evitar.
 *
 * Nada aqui está gravado ainda. Os times mostrados são a prévia exata
 * do que "Confirmar" vai persistir: o seed é o mesmo (`nonce`).
 */
export function NextUpSheet({
  summary,
  score,
  teamA,
  teamB,
  missing,
  busy,
  onConfirm,
  onReshuffle,
  onClose,
}: {
  summary: FinishSummary;
  /** Placar da partida que acabou, quando alguém marcou. */
  score?: { a: number | null; b: number | null };
  /** Prévia da próxima partida. null quando ainda não dá pra formar. */
  teamA: SessionPlayer[] | null;
  teamB: SessionPlayer[] | null;
  /** Quantos faltam, quando não dá pra formar. */
  missing: number;
  busy: boolean;
  onConfirm: () => void;
  onReshuffle: () => void;
  onClose: () => void;
}) {
  const winnerLabel = `Time ${summary.winner}`;
  const stayingTeam: Team = summary.winnerDissolved
    ? summary.winner === "A"
      ? "B"
      : "A"
    : summary.winner;

  const labels = courtNames([
    ...summary.staying,
    ...summary.leaving,
    ...(teamA ?? []),
    ...(teamB ?? []),
  ]);

  // quem entra = quem está na prévia e não estava na quadra
  const stayingIds = new Set(summary.staying.map((p) => p.id));
  const entering = [...(teamA ?? []), ...(teamB ?? [])].filter(
    (p) => !stayingIds.has(p.id),
  );

  const nameList = (players: SessionPlayer[]) =>
    players.map((p) => labels.get(p.id) ?? p.name).join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="bg-surface border-border max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-1 flex items-center">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            {winnerLabel} venceu
            {score && score.a !== null && score.b !== null && (
              <span className="tnum text-muted ml-2">
                {Math.max(score.a, score.b)}×{Math.min(score.a, score.b)}
              </span>
            )}
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

        {/* a frase que evita a discussão */}
        {summary.winnerDissolved ? (
          <p className="text-accent mb-4 flex items-start gap-1.5 text-sm">
            <Flame className="mt-0.5 size-4 shrink-0" />
            <span>
              Bateu o teto de vitórias seguidas: o {winnerLabel} foi desfeito e
              volta pra fila. Quem perdeu segura a quadra e enfrenta gente nova.
            </span>
          </p>
        ) : (
          <p className="text-muted mb-4 text-sm">
            {winnerLabel} fica na quadra
            {summary.streak > 1 ? ` (${summary.streak} seguidas)` : ""}. Quem
            perdeu volta pro fim da fila.
          </p>
        )}

        <dl className="mb-4 flex flex-col gap-2">
          <div className="bg-surface-2 rounded-[12px] px-3 py-2.5">
            <dt className="font-display text-muted mb-1 text-sm tracking-widest uppercase">
              Fica na quadra — Time {stayingTeam} da próxima
            </dt>
            <dd className="font-display text-ink text-base font-semibold tracking-wide uppercase">
              {summary.staying.length ? nameList(summary.staying) : "ninguém"}
            </dd>
          </div>

          <div className="bg-surface-2 rounded-[12px] px-3 py-2.5">
            <dt className="font-display text-muted mb-1 text-sm tracking-widest uppercase">
              Sai
            </dt>
            <dd className="font-display text-muted text-base font-semibold tracking-wide uppercase">
              {nameList(summary.leaving)}
            </dd>
          </div>

          {teamA && teamB ? (
            <div className="bg-surface-2 rounded-[12px] px-3 py-2.5">
              <dt className="font-display text-team-b mb-1 text-sm tracking-widest uppercase">
                Entra
              </dt>
              <dd className="font-display text-ink text-base font-semibold tracking-wide uppercase">
                {entering.length ? nameList(entering) : "—"}
              </dd>
            </div>
          ) : (
            <p className="text-muted px-1 py-2 text-sm">
              {missing > 0
                ? `Faltam ${missing} pra formar a próxima. A quadra fica livre até alguém fazer check-in.`
                : "Ainda não dá pra montar a próxima partida."}
            </p>
          )}
        </dl>

        {teamA && teamB && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="font-display bg-accent text-bg h-14 rounded-[12px] text-base font-bold tracking-widest uppercase disabled:opacity-40"
            >
              Começar esta partida
            </button>
            <button
              type="button"
              onClick={onReshuffle}
              disabled={busy}
              className="font-display border-border text-muted h-12 rounded-[12px] border text-sm tracking-widest uppercase disabled:opacity-40"
            >
              🎲 sortear outros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
