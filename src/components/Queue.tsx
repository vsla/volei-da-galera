"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import { courtNames, type SessionPlayer } from "@/lib/types";

const COLLAPSED = 6;

/**
 * OS PRÓXIMOS A ENTRAR — o bloco fixo no topo da fila.
 *
 * Playtest 01: "tem que mostrar os próximos antes de acabar, pra dar
 * mais agilidade". O `▶` na fila já existia, mas a fila colapsa em 6
 * linhas e quem entrava da 7ª pra baixo não aparecia sem expandir.
 *
 * Mostrar exatamente `teamSize` nomes é correto em qualquer cenário: a
 * rotação garante que SEMPRE giram `teamSize` por partida
 * (`reasonable.md` §8) — ganhando o campeão ou batendo o teto, entram 6
 * de fora. Quem exatamente pode mudar no desempate entre empatados em
 * jogos, por isso o rótulo é "prováveis" quando a partida ainda corre.
 */
function NextUpStrip({
  players,
  meId,
  exact,
}: {
  players: SessionPlayer[];
  meId?: string | null;
  exact: boolean;
}) {
  if (players.length === 0) return null;
  const labels = courtNames(players);

  return (
    <section className="mt-4 px-4">
      <div className="border-accent/30 bg-accent/5 rounded-[12px] border px-3 py-2.5">
        <h2 className="font-display text-accent mb-1.5 text-sm font-bold tracking-widest uppercase">
          ▶ {exact ? "entram na próxima" : "prováveis na próxima"}
        </h2>
        <ul className="flex flex-wrap gap-x-2 gap-y-1">
          {players.map((p) => (
            <li
              key={p.id}
              className={`font-display text-base font-semibold tracking-wide uppercase ${
                p.id === meId ? "text-accent" : "text-ink"
              }`}
            >
              {p.id === meId ? "você" : (labels.get(p.id) ?? p.name)}
              {p.id !== players[players.length - 1].id && (
                <span className="text-muted/50"> ·</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Queue({
  players,
  meId,
  onExplain,
  onPlayerTap,
  ranking,
  nextUpIds,
  nextUp,
  nextUpExact = false,
}: {
  /** já ordenada pela fila: menos jogos → há mais tempo sem jogar → sorteio */
  players: SessionPlayer[];
  meId?: string | null;
  onExplain?: () => void;
  /** Organizador toca pra botar na quadra ou marcar que foi embora. */
  onPlayerTap?: (player: SessionPlayer) => void;
  /**
   * Posição de cada um no ranking de nota. Só o organizador recebe —
   * pra galera a nota continua invisível, senão vira ranking social.
   */
  ranking?: Map<string, number>;
  /** Quem entra na próxima partida — o "▶" do bot. */
  nextUpIds?: Set<string>;
  /** Os mesmos, na ordem da fila, pro bloco fixo do topo. */
  nextUp?: SessionPlayer[];
  /** true entre partidas (a prévia é exata); false com jogo rolando. */
  nextUpExact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  /**
   * Colapsada, a fila mostra 6 — MAS nunca corta alguém com `▶`.
   *
   * Era o bug do playtest: quem entrava na próxima e estava na 7ª
   * posição simplesmente não aparecia, e a informação mais útil da tela
   * ficava escondida atrás de "mostrar todos".
   */
  const lastMarked = nextUpIds
    ? players.reduce((last, p, i) => (nextUpIds.has(p.id) ? i : last), -1)
    : -1;
  const cut = Math.max(COLLAPSED, lastMarked + 1);
  const shown = expanded ? players : players.slice(0, cut);
  const hidden = players.length - shown.length;

  return (
    <>
      <NextUpStrip players={nextUp ?? []} meId={meId} exact={nextUpExact} />

      <section className="mt-4 px-4 pb-4">
        <div className="mb-2 flex items-center">
          <h2 className="font-display text-muted text-base font-bold tracking-widest uppercase">
            Fila
          </h2>
          <button
            type="button"
            onClick={onExplain}
            aria-label="Por que esses jogadores"
            className="text-muted hover:text-accent -my-2 ml-auto flex size-12 items-center justify-center"
          >
            <HelpCircle className="size-5" />
          </button>
        </div>

        {players.length === 0 ? (
          <p className="text-muted py-6 text-center">Ninguém esperando.</p>
        ) : (
          <ol className="flex flex-col gap-1">
            {shown.map((p, i) => {
              const isMe = p.id === meId;
              const Row = onPlayerTap ? "button" : "div";
              return (
                <li key={p.id}>
                  <Row
                    {...(onPlayerTap
                      ? { type: "button" as const, onClick: () => onPlayerTap(p) }
                      : {})}
                    className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-left ${
                      isMe ? "bg-accent/10 ring-accent/40 ring-1" : "bg-surface"
                    }`}
                  >
                    <span className="font-display tnum text-muted w-5 text-center text-base font-bold">
                      {/* ▶ = entra na próxima, igual ao bot */}
                      {nextUpIds?.has(p.id) ? (
                        <span className="text-accent">▶</span>
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span
                      className={`font-display flex-1 truncate text-base font-semibold tracking-wide uppercase ${
                        isMe ? "text-accent" : "text-ink"
                      }`}
                    >
                      {isMe ? "você" : p.name}
                    </span>
                    {/* nota e ranking: só o organizador vê */}
                    {ranking && (
                      <span className="tnum text-muted/70 text-sm">
                        #{ranking.get(p.id) ?? "—"} · {p.rating.toFixed(1)}
                      </span>
                    )}
                    {/* espera em rodadas, não em relógio: é assim que a
                        galera reclama, e é o que a fila usa pra desempatar.
                        Já vem contando a partida que está rolando agora. */}
                    {p.roundsWaiting > 0 && (
                      <span className="tnum text-muted/70 text-sm">
                        fora {p.roundsWaiting}
                      </span>
                    )}
                    <span className="tnum text-muted text-sm">
                      {p.gamesPlayed} {p.gamesPlayed === 1 ? "jogo" : "jogos"}
                    </span>
                    {isMe && <span className="text-accent">◄</span>}
                  </Row>
                </li>
              );
            })}
          </ol>
        )}

        {ranking && players.length > 0 && (
          <p className="text-muted/60 mt-2 px-3 text-xs">
            #ranking · nota — só você vê. ▶ entra na próxima.
          </p>
        )}

        {(hidden > 0 || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-display text-muted hover:text-ink h-12 w-full text-sm tracking-widest uppercase"
          >
            {expanded ? "▴ mostrar menos" : `▾ mostrar todos (${hidden})`}
          </button>
        )}
      </section>
    </>
  );
}
