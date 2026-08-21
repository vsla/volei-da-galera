"use client";

import { Flame } from "lucide-react";
import type { LiveState } from "@/lib/db";
import { DEFAULT_TEAM_LABELS, type TeamLabels } from "@/lib/teams";
import { courtNames, type SessionPlayer, type Team } from "@/lib/types";

/**
 * A QUADRA ENTRE UMA PARTIDA E OUTRA.
 *
 * Antes, terminar um jogo deixava "quadra livre" na tela e o resultado
 * só existia num modal — fechou, perdeu. Aqui o estado é derivado do
 * banco (`lastMatch` + `championIds`), então:
 *
 *   - todo mundo vê o mesmo, não só quem apertou o botão;
 *   - recarregar a página não perde nada;
 *   - dá pra reabrir a próxima partida quantas vezes quiser.
 *
 * O que a tela precisa dizer, nesta ordem: quem ganhou, com quanto, quem
 * está segurando a quadra, e o que fazer agora.
 */
export function FinishedCourt({
  last,
  championIds,
  championStreak,
  meId,
  canStart,
  busy,
  teamLabels = DEFAULT_TEAM_LABELS,
  onOpenNext,
}: {
  last: NonNullable<LiveState["lastMatch"]>;
  championIds: string[];
  championStreak: number;
  meId?: string | null;
  teamLabels?: TeamLabels;
  /** só o organizador monta a próxima */
  canStart: boolean;
  busy: boolean;
  onOpenNext: () => void;
}) {
  const labels = courtNames([...last.teamA, ...last.teamB]);
  const staying = new Set(championIds);
  const hasScore = last.scoreA !== null && last.scoreB !== null;

  // quem segurou a quadra pode ser o perdedor, quando o vencedor bateu
  // o teto de vitórias e foi desfeito
  const stayingTeam: Team | null = last.teamA.some((p) => staying.has(p.id))
    ? "A"
    : last.teamB.some((p) => staying.has(p.id))
      ? "B"
      : null;
  const dissolved = stayingTeam !== null && stayingTeam !== last.winner;

  const Side = ({ team, players }: { team: Team; players: SessionPlayer[] }) => {
    const won = last.winner === team;
    const color = team === "A" ? "bg-team-a" : "bg-team-b";
    const text = team === "A" ? "text-team-a" : "text-team-b";

    return (
      <div className={`relative py-3 pr-4 pl-5 ${won ? "" : "opacity-55"}`}>
        <span className={`absolute top-3 bottom-3 left-0 w-1 rounded-full ${color}`} />

        <div className="flex items-center gap-2">
          <h3
            className={`font-display text-lg font-extrabold tracking-widest uppercase ${text}`}
          >
            {teamLabels[team]}
          </h3>
          {won && (
            <span className="font-display text-accent text-sm font-bold tracking-widest uppercase">
              venceu
            </span>
          )}
          {hasScore && (
            <span className="font-display tnum text-ink ml-auto text-2xl font-extrabold">
              {team === "A" ? last.scoreA : last.scoreB}
            </span>
          )}
        </div>

        <ul className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-1">
          {players.map((p) => (
            <li
              key={p.id}
              className={`font-display truncate text-sm font-semibold tracking-wide uppercase ${
                p.id === meId ? "text-accent" : "text-muted"
              }`}
            >
              {labels.get(p.id) ?? p.name}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <section className="bg-surface border-border mx-4 mt-4 overflow-hidden rounded-[16px] border">
      <div className="border-border bg-surface-2 flex items-center gap-2 border-b px-5 py-2">
        <span className="font-display text-muted text-sm font-bold tracking-widest uppercase">
          Partida {last.round} encerrada
        </span>
      </div>

      <Side team="A" players={last.teamA} />
      <Side team="B" players={last.teamB} />

      {/* o estado que a tela precisava ter: quem fica, esperando quem */}
      {stayingTeam && (
        <div className="border-border flex items-center gap-2 border-t px-5 py-3">
          <Flame className="text-accent size-4 shrink-0" />
          <p className="text-ink text-sm">
            <span className="font-display font-bold tracking-widest uppercase">
              {teamLabels[stayingTeam]}
            </span>{" "}
            segura a quadra
            {championStreak > 0 && (
              <span className="tnum">
                {" "}
                ({championStreak} {championStreak === 1 ? "vitória" : "vitórias"})
              </span>
            )}
            {dissolved && (
              <span className="text-muted">
                {" "}
                — o time que venceu bateu o teto e foi desfeito
              </span>
            )}
            <span className="text-muted"> · esperando o próximo adversário</span>
          </p>
        </div>
      )}

      {canStart && (
        <div className="border-border border-t p-3">
          <button
            type="button"
            onClick={onOpenNext}
            disabled={busy}
            className="font-display bg-accent text-accent-ink h-14 w-full rounded-[12px] text-base font-bold tracking-widest uppercase disabled:opacity-40"
          >
            ▶ Ver a próxima partida
          </button>
        </div>
      )}
    </section>
  );
}
