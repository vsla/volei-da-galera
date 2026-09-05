"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ensureSession } from "@/lib/auth";
import { initials } from "@/lib/types";
import {
  castVotes,
  closeVoting,
  fetchHighlights,
  fetchVoters,
  myVotes,
  type HighlightResult,
  type LiveState,
} from "@/lib/db";

/**
 * Destaques do Dia.
 *
 * Cada um escolhe até 3. Voto é privado e a contagem NUNCA aparece —
 * a graça é a brincadeira, não um ranking de popularidade.
 */
export function Highlights({
  state,
  meId,
  isOrganizer,
  onBack,
  onSwitchMe,
  refresh,
}: {
  state: LiveState;
  meId: string;
  isOrganizer: boolean;
  onBack: () => void;
  /** Trocar de pessoa, quando o celular está logado como outro. */
  onSwitchMe: () => void;
  refresh: () => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [voted, setVoted] = useState(false);
  const [result, setResult] = useState<HighlightResult | null>(null);
  const [busy, setBusy] = useState(false);

  const [voters, setVoters] = useState<Map<string, number> | null>(null);
  /** A leitura do próprio voto falhou — diferente de "não votei". */
  const [readFailed, setReadFailed] = useState(false);

  /** Quantos cada um escolhe — configuração da pelada. */
  const votesPerPlayer = state.settings.votesPerPlayer;

  const candidates = state.players
    .filter((p) => p.checkedInAt !== null && p.id !== meId)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  const meName = state.players.find((p) => p.id === meId)?.name;
  const checkedIn = state.players.filter((p) => p.checkedInAt !== null);
  const missing = voters
    ? checkedIn
        .filter((p) => !voters.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    : [];

  useEffect(() => {
    let alive = true;
    void (async () => {
      // a sessão TEM que existir antes da leitura: a policy do voto é
      // `to authenticated`, e sem JWT o Postgres não recusa — ele
      // devolve zero linha, que a tela leria como "ainda não votei"
      await ensureSession();
      const ids = await myVotes(state.sessionId, meId);
      if (!alive) return;
      setReadFailed(ids === null);
      if (ids?.length) {
        setPicked(ids);
        setVoted(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [state.sessionId, meId]);

  useEffect(() => {
    if (state.status !== "closed") return;
    fetchHighlights(state.sessionId, state.players).then(setResult);
  }, [state.status, state.sessionId, state.players]);

  // Todo mundo lê: é por aqui que a tela sabe que VOCÊ já votou mesmo
  // quando não consegue recuperar em quem. A `highlight_voters` (0009)
  // devolve só quem votou e quantos votos deu, nunca em quem — então
  // ler isso no aparelho de qualquer um não conta nada de ninguém.
  // O painel de "falta votar", esse sim, continua só do organizador.
  useEffect(() => {
    const load = () =>
      fetchVoters(state.sessionId)
        .then((v) => v && setVoters(v))
        .catch(() => {});
    load();
    // atualiza sozinho enquanto a votação corre: quem cutuca não fica
    // recarregando a página pra ver se caiu mais um
    if (!isOrganizer) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [isOrganizer, state.sessionId, voted]);

  /**
   * O banco diz que você votou, mas a tela não tem as escolhas.
   *
   * É o bug de 05/09 visto de dentro: sem a policy de select da 0018 o
   * `myVotes` devolve vazio sem erro nenhum. Enquanto a migration não
   * roda, é melhor a tela DIZER que não conseguiu recuperar do que
   * mostrar um boletim em branco e deixar a pessoa achar que o voto
   * dela se perdeu — ou votar de novo por engano.
   */
  const iVoted = voters?.has(meId) ?? false;
  const ballotLost = picked.length === 0 && (iVoted || readFailed);

  const toggle = (id: string) => {
    // mexeu na seleção, o que está na tela deixou de ser o que está no
    // banco — o botão volta a dizer "votar", não "voto salvo ✓"
    setVoted(false);
    setPicked((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= votesPerPlayer
          ? cur
          : [...cur, id],
    );
  };

  // ── resultado ──────────────────────────────────────────────
  if (state.status === "closed") {
    return (
      <main className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-10 pb-6">
        <h1 className="font-display text-ink mb-8 text-center text-2xl font-extrabold tracking-widest uppercase">
          🏆 Destaques de hoje
        </h1>

        <ul className="flex flex-col gap-3">
          {(result?.winners ?? []).map((p) => (
            <li
              key={p.id}
              className="bg-surface border-border flex items-center gap-4 rounded-[16px] border px-5 py-6"
            >
              {/* a foto que o playtest pediu: quem tem conta aparece de
                  cara no destaque; quem não tem continua com a estrela */}
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatarUrl}
                  alt=""
                  className="border-accent/40 size-14 shrink-0 rounded-full border object-cover"
                />
              ) : (
                <span className="text-3xl">⭐</span>
              )}
              <span className="font-display text-ink truncate text-xl font-extrabold tracking-widest uppercase">
                {p.name}
              </span>
            </li>
          ))}
        </ul>

        {result && result.winners.length === 0 && (
          <p className="text-muted py-10 text-center">Ninguém votou hoje.</p>
        )}

        <p className="text-muted mt-10 text-center">
          Valeu, galera ❤️
          <br />
          Até sexta!
        </p>

        <Link
          href={`/p/${state.peladaSlug}/destaques/${state.date}`}
          className="font-display bg-accent text-accent-ink mt-8 flex h-14 items-center justify-center rounded-[12px] text-lg font-extrabold tracking-widest uppercase"
        >
          🖼 abrir card pra postar
        </Link>

        <Link
          href={`/p/${state.peladaSlug}/destaques`}
          className="font-display text-muted mt-2 flex h-12 items-center justify-center text-sm tracking-widest uppercase"
        >
          ver destaques anteriores
        </Link>

        <button
          type="button"
          onClick={onBack}
          className="font-display text-muted h-12 text-sm tracking-widest uppercase"
        >
          voltar pra quadra
        </button>
      </main>
    );
  }

  // ── votação ────────────────────────────────────────────────
  return (
    <main className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-8 pb-6">
      <h1 className="font-display text-ink text-center text-2xl font-extrabold tracking-widest uppercase">
        ⭐ Destaques do dia
      </h1>

      {/*
        Quem você é, antes da lista.
        Esta tela esconde você mesmo — então, se a identidade estiver
        errada, o sintoma é "fulano sumiu da lista", e a pessoa vota a
        noite inteira no lugar de outra. Aconteceu de verdade.
      */}
      <button
        type="button"
        onClick={onSwitchMe}
        className="bg-surface border-border mx-auto mt-4 flex max-w-full items-center gap-2 rounded-full border px-4 py-2"
      >
        <span className="text-muted text-sm">Votando como</span>
        <span className="font-display text-accent truncate text-base font-bold tracking-wide uppercase">
          {meName ?? "?"}
        </span>
        <span className="text-muted text-xs underline">trocar</span>
      </button>

      <p className="text-muted mt-4 mb-6 text-center">
        Escolha até {votesPerPlayer}. Jogada, resenha, disposição, evolução —
        o que você quiser.
      </p>

      <ul className="grid grid-cols-2 gap-2">
        {candidates.map((p) => {
          const on = picked.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={`flex min-h-[64px] w-full items-center gap-3 rounded-[12px] border px-3 py-2 text-left ${
                  on
                    ? "border-accent bg-accent/10"
                    : "bg-surface border-border"
                }`}
              >
                <span
                  className={`font-display flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold ${
                    on ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
                  }`}
                >
                  {on ? (
                    "✓"
                  ) : p.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    initials(p.name)
                  )}
                </span>
                <span className="font-display text-ink truncate text-base font-semibold tracking-wide uppercase">
                  {p.name}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="font-display tnum text-muted mt-4 text-center tracking-widest">
        {picked.length} / {votesPerPlayer}
      </p>

      {ballotLost && (
        <p className="bg-live/15 border-live/40 text-ink mt-4 rounded-[12px] border px-3 py-2.5 text-sm">
          {iVoted ? (
            <>
              <strong>Seu voto de hoje está salvo</strong> — este aparelho é
              que não conseguiu recuperar em quem você votou. Pode deixar como
              está. Se votar de novo, o voto anterior é substituído.
            </>
          ) : (
            <>
              Não deu pra conferir se você já votou. Se já tiver votado, votar
              de novo substitui o voto anterior.
            </>
          )}
        </p>
      )}

      {/* quem falta votar — só o organizador, e só QUEM votou, nunca
          em quem (a lista vem da highlight_voters, migration 0009) */}
      {isOrganizer && voters && (
        <section className="bg-surface border-border mt-6 rounded-[12px] border px-3 py-3">
          <h2 className="font-display text-muted mb-2 text-sm font-bold tracking-widest uppercase">
            Votação · {voters.size} de {checkedIn.length}
          </h2>
          {missing.length === 0 ? (
            <p className="text-accent text-sm">Todo mundo votou.</p>
          ) : (
            <>
              <p className="text-muted mb-1.5 text-sm">Falta votar:</p>
              <p className="font-display text-ink text-base font-semibold tracking-wide uppercase">
                {missing.map((p) => p.name).join(" · ")}
              </p>
              {/* cutucar é no grupo, não no app: o que falta é o texto */}
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard?.writeText(
                    `Falta votar nos Destaques: ${missing
                      .map((p) => p.name)
                      .join(", ")} 🏐⭐`,
                  )
                }
                className="font-display text-muted mt-2 h-10 text-xs tracking-widest uppercase underline"
              >
                copiar pro grupo
              </button>
            </>
          )}
        </section>
      )}

      {/* fundo sólido: sem ele a lista passava POR BAIXO do botão e
          ficava ilegível (o -mx-4 px-4 estica o fundo até as bordas) */}
      <div className="bg-bg sticky bottom-0 -mx-4 mt-6 flex flex-col gap-2 px-4 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={busy || picked.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await castVotes(state.sessionId, meId, picked, votesPerPlayer);
              setVoted(true);
            } finally {
              setBusy(false);
            }
          }}
          className="font-display bg-accent text-accent-ink flex h-14 items-center justify-center rounded-[12px] text-lg font-extrabold tracking-widest uppercase disabled:opacity-40"
        >
          {voted || (iVoted && picked.length === 0)
            ? "voto salvo ✓"
            : iVoted
              ? "trocar meu voto"
              : "votar"}
        </button>

        {isOrganizer && (
          <button
            type="button"
            onClick={async () => {
              // encerrar com gente faltando é decisão legítima (sempre
              // vai ter alguém que já foi embora) — mas tem que ser
              // DECISÃO, não descuido: a tela diz quantos faltam
              if (
                missing.length > 0 &&
                !confirm(
                  `Ainda faltam ${missing.length} votar (${missing
                    .map((p) => p.name)
                    .join(", ")}). Encerrar mesmo assim?`,
                )
              ) {
                return;
              }
              await closeVoting(state.sessionId);
              await refresh();
            }}
            className="font-display text-muted h-12 text-sm tracking-widest uppercase"
          >
            encerrar votação e revelar
          </button>
        )}

        <button
          type="button"
          onClick={onBack}
          className="font-display text-muted h-12 text-sm tracking-widest uppercase"
        >
          voltar
        </button>
      </div>
    </main>
  );
}
