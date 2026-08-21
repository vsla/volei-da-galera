"use client";

import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import {
  fetchDayMatches,
  fetchHighlightDays,
  type HighlightDay,
  type PlayedMatch,
} from "@/lib/db";
import { DEFAULT_TEAM_LABELS, type TeamLabels } from "@/lib/teams";
import { courtNames, type SessionPlayer, type Team } from "@/lib/types";

/**
 * HISTÓRICO — o que já aconteceu, aberto pra todo mundo.
 *
 * Duas perguntas diferentes, duas abas:
 *   HOJE    → "quem ganhou de quem hoje?" (some no reset da noite)
 *   PELADAS → "quem foram os destaques nas outras sextas?"
 *
 * É leitura pura: nada aqui muda estado. Por isso não é escondido atrás
 * do PIN — a fila e o resultado são de todo mundo, e ter que perguntar
 * pro organizador quem ganhou a terceira é exatamente o que o site
 * existe pra evitar.
 */

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" })
    .format(new Date(`${iso}T12:00:00`))
    .replace(/\./g, "");

const timeLabel = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(
        new Date(iso),
      )
    : "";

function MatchRow({
  match,
  teamLabels,
}: {
  match: PlayedMatch;
  teamLabels: TeamLabels;
}) {
  const labels = courtNames([...match.teamA, ...match.teamB]);
  const hasScore = match.scoreA !== null && match.scoreB !== null;

  const Side = ({ team, players }: { team: Team; players: SessionPlayer[] }) => {
    const won = match.winner === team;
    const text = team === "A" ? "text-team-a" : "text-team-b";
    return (
      <div className={`flex items-baseline gap-2 ${won ? "" : "opacity-55"}`}>
        <span
          className={`font-display w-14 shrink-0 text-sm font-extrabold tracking-widest uppercase ${text}`}
        >
          {teamLabels[team]}
        </span>
        <span className="font-display text-ink flex-1 text-sm tracking-wide uppercase">
          {players.map((p) => labels.get(p.id) ?? p.name).join(" · ")}
        </span>
        {hasScore && (
          <span className="font-display tnum text-ink shrink-0 text-lg font-extrabold">
            {team === "A" ? match.scoreA : match.scoreB}
          </span>
        )}
        {!hasScore && won && <span className="text-accent shrink-0 text-sm">✓</span>}
      </div>
    );
  };

  return (
    <li className="bg-surface-2 rounded-[12px] px-3 py-2.5">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-display text-muted text-sm font-bold tracking-widest uppercase">
          Partida {match.round}
        </span>
        <span className="tnum text-muted/70 ml-auto text-xs">
          {timeLabel(match.finishedAt)}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <Side team="A" players={match.teamA} />
        <Side team="B" players={match.teamB} />
      </div>
    </li>
  );
}

export function HistorySheet({
  sessionId,
  peladaId,
  players,
  teamLabels = DEFAULT_TEAM_LABELS,
  onStats,
  onClose,
}: {
  sessionId: string;
  /** As outras noites são DESTA pelada, não do banco inteiro. */
  peladaId: string;
  /** Os jogadores da noite, pra resolver os nomes sem nova consulta. */
  players: SessionPlayer[];
  teamLabels?: TeamLabels;
  onStats?: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"hoje" | "peladas">("hoje");
  const [matches, setMatches] = useState<PlayedMatch[] | null>(null);
  const [days, setDays] = useState<HighlightDay[] | null>(null);

  useEffect(() => {
    fetchDayMatches(sessionId, players).then(setMatches).catch(() => setMatches([]));
  }, [sessionId, players]);

  useEffect(() => {
    if (tab !== "peladas" || days) return;
    fetchHighlightDays(peladaId).then(setDays).catch(() => setDays([]));
  }, [tab, days, peladaId]);

  const tabClass = (active: boolean) =>
    `font-display h-11 flex-1 rounded-[10px] text-sm font-bold tracking-widest uppercase ${
      active ? "bg-surface-2 text-ink" : "text-muted"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <div className="bg-surface border-border flex max-h-[90dvh] w-full max-w-[480px] flex-col rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            Histórico
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

        <div className="bg-bg mb-3 flex gap-1 rounded-[12px] p-1">
          <button type="button" onClick={() => setTab("hoje")} className={tabClass(tab === "hoje")}>
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setTab("peladas")}
            className={tabClass(tab === "peladas")}
          >
            Outras peladas
          </button>
        </div>

        <div className="-mx-1 flex-1 overflow-y-auto overscroll-contain px-1">
          {tab === "hoje" ? (
            matches === null ? (
              <p className="text-muted py-8 text-center">Carregando…</p>
            ) : matches.length === 0 ? (
              <p className="text-muted py-8 text-center">
                Nenhuma partida encerrada ainda hoje.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {matches.map((m) => (
                  <MatchRow key={m.id} match={m} teamLabels={teamLabels} />
                ))}
              </ul>
            )
          ) : days === null ? (
            <p className="text-muted py-8 text-center">Carregando…</p>
          ) : days.length === 0 ? (
            <p className="text-muted py-8 text-center">
              Nenhuma pelada com Destaques ainda.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {days.map((d) => (
                <li key={d.sessionId} className="bg-surface-2 rounded-[12px] px-3 py-2.5">
                  <div className="mb-1 flex items-center gap-2">
                    <Star className="text-accent size-4" />
                    <span className="font-display text-muted text-sm font-bold tracking-widest uppercase">
                      {dayLabel(d.date)}
                    </span>
                  </div>
                  <p className="font-display text-ink text-base font-semibold tracking-wide uppercase">
                    {d.winners.map((w) => w.name).join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {onStats && (
          <button
            type="button"
            onClick={onStats}
            className="font-display border-border text-ink mt-3 h-12 w-full rounded-[12px] border text-sm tracking-widest uppercase"
          >
            📊 números da pelada
          </button>
        )}
      </div>
    </div>
  );
}
