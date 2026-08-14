"use client";

import { X } from "lucide-react";
import type { Explanation } from "@/lib/match-generator";

/**
 * A tela que faz a galera confiar no sorteio.
 *
 * Mostra também o PRIMEIRO que não entrou, com o motivo — é o que
 * responde "por que ele e não eu?" antes de virar discussão na areia.
 */
export function WhySheet({
  explanation,
  teamSize,
  onClose,
}: {
  explanation: Explanation | null;
  teamSize: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="bg-surface border-border max-h-[85dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            Por que esses {teamSize}
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

        {!explanation ? (
          <p className="text-muted py-8 text-center">
            Ainda não dá pra montar a próxima partida.
          </p>
        ) : (
          <>
            <p className="text-muted mb-4">Quem jogou menos entra primeiro.</p>

            <ul className="flex flex-col gap-1">
              {explanation.picked.map((p) => (
                <li
                  key={p.player.id}
                  className="bg-surface-2 flex items-center gap-2 rounded-[12px] px-3 py-2.5"
                >
                  <span className="font-display text-ink flex-1 truncate text-base font-semibold tracking-wide uppercase">
                    {p.player.name}
                  </span>
                  <span className="tnum text-muted text-sm">
                    {p.games} {p.games === 1 ? "jogo" : "jogos"}
                  </span>
                  <span className="text-accent text-sm">✓</span>
                  {p.byTiebreak && <span title="sorteio de empate">⚖️</span>}
                </li>
              ))}
            </ul>

            {explanation.firstOut && (
              <>
                <div className="border-border my-2 border-t border-dashed" />
                <div className="flex items-center gap-2 rounded-[12px] px-3 py-2.5 opacity-60">
                  <span className="font-display text-ink flex-1 truncate text-base font-semibold tracking-wide uppercase">
                    {explanation.firstOut.player.name}
                  </span>
                  <span className="tnum text-muted text-sm">
                    {explanation.firstOut.games}{" "}
                    {explanation.firstOut.games === 1 ? "jogo" : "jogos"}
                  </span>
                  <span className="text-muted text-sm">ficou</span>
                  {explanation.firstOut.byTiebreak && <span>⚖️</span>}
                </div>
              </>
            )}

            <dl className="text-muted mt-5 flex flex-col gap-1.5 text-sm">
              <div className="flex gap-2">
                <dt>⚖️ diferença de jogos:</dt>
                <dd className="tnum text-ink">{explanation.gamesDiff}</dd>
              </div>
              <div className="flex gap-2">
                <dt>🔄 parceiros repetidos:</dt>
                <dd className="tnum text-ink">{explanation.repeatedTeammatePairs}</dd>
              </div>
              {explanation.tiebreakUsed && (
                <div className="flex gap-2">
                  <dt>🎲 empate resolvido por sorteio</dt>
                </div>
              )}
              {/* furar a fila nunca pode ser silencioso: se aconteceu,
                  a tela diz quantos e por quê */}
              {explanation.extraGamesUsed > 0 && (
                <div className="flex gap-2">
                  <dt className="text-accent">
                    ⚡ {explanation.extraGamesUsed}{" "}
                    {explanation.extraGamesUsed === 1
                      ? "entrou com 1 jogo a mais"
                      : "entraram com 1 jogo a mais"}{" "}
                    pra partida não ser atropelo — voltam pra frente da fila na
                    próxima
                  </dt>
                </div>
              )}
            </dl>
          </>
        )}
      </div>
    </div>
  );
}
