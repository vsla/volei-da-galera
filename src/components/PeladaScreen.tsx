"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveSession } from "@/hooks/useLiveSession";
import { NamePicker } from "@/components/NamePicker";
import { Lobby } from "@/components/Lobby";
import {
  addGuest,
  ensureTodaySession,
  fetchPeladaBySlug,
  fetchState,
  type Pelada,
} from "@/lib/db";
import { AccountSheet } from "@/components/AccountSheet";
import { claimPlayer, ensureSession, myPlayerId } from "@/lib/auth";
import { getMe, setLastPelada, setMe } from "@/lib/identity";

/** A data de hoje no fuso de quem joga — não no do servidor. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * Uma pelada, ao vivo.
 *
 * Resolve o slug → pelada → sessão de hoje, e só então entrega o lobby.
 * A sessão da noite não é criada por cron nem à mão no SQL Editor: ela
 * nasce no primeiro toque de quem chega — se depender de alguém lembrar
 * de "abrir a noite", uma sexta vai começar sem lista.
 */
export function PeladaScreen({ slug }: { slug: string }) {
  const router = useRouter();
  const [pelada, setPelada] = useState<Pelada | null | undefined>(undefined);
  const [meId, setMeId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState(false);
  /** O nome escolhido já é de outro aparelho. */
  const [taken, setTaken] = useState(false);
  const [openErr, setOpenErr] = useState<string | null>(null);
  const [account, setAccount] = useState(false);

  useEffect(() => {
    // sessão (anônima, se não houver conta) antes de qualquer escrita:
    // desde a 0014 a RLS recusa check-in sem `auth.uid()`
    void ensureSession();
    setMeId(getMe());
    setReady(true);
    fetchPeladaBySlug(slug)
      .then((p) => {
        setPelada(p);
        if (p) setLastPelada(p.slug);
      })
      .catch(() => setPelada(null));
  }, [slug]);

  const { state, loading, stale, failed, refresh } = useLiveSession(
    pelada?.id ?? null,
  );

  const openTonight = useCallback(async () => {
    if (!pelada || opening) return;
    setOpening(true);
    setOpenErr(null);
    try {
      await ensureSession();
      // relê antes de criar. Se a noite já existe e a tela só não tinha
      // conseguido carregar, abrir "hoje" criaria uma sessão de data
      // mais nova que passaria na frente e esconderia a noite em
      // andamento — check-in, partidas e votos sumiriam da tela.
      const current = await fetchState(pelada.id);
      if (!current) await ensureTodaySession(pelada.id, today());
      await refresh();
    } catch (e) {
      setOpenErr(e instanceof Error ? e.message : "Não deu pra abrir a lista.");
    } finally {
      setOpening(false);
    }
  }, [pelada, refresh, opening]);

  /**
   * Clicar no próprio nome AMARRA o jogador a este aparelho.
   *
   * No v1 a escolha era só localStorage, e "qualquer um consegue clicar
   * no nome de qualquer um" era aceitável entre amigos. Com a RLS da
   * 0014 a escrita passa a exigir que você SEJA aquele jogador, então a
   * escolha reivindica o nome — se ele ainda não tem dono.
   *
   * Se já tiver (a pessoa está com o celular dela na mão), a tela avisa:
   * dá pra acompanhar, mas o check-in é dela. É o conserto de raiz do
   * "votei a noite inteira como outra pessoa".
   */
  const pick = async (playerId: string) => {
    setMe(playerId);
    setMeId(playerId);
    try {
      const ok = await claimPlayer(playerId);
      setTaken(!ok);
    } catch {
      setTaken(false);
    }
  };

  if (!ready || pelada === undefined || (pelada && loading)) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="text-4xl">🏐</span>
      </main>
    );
  }

  if (!pelada) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🏐</span>
        <p className="font-display text-muted text-lg tracking-widest uppercase">
          Pelada não encontrada
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="font-display text-accent h-12 text-sm tracking-widest uppercase"
        >
          ver todas as peladas
        </button>
      </main>
    );
  }

  // não deu pra ler o estado — e isso NÃO é "ninguém abriu a lista".
  // Confundir as duas coisas é o que fazia a tela oferecer "abrir a
  // lista de hoje" por cima de uma noite que estava rolando.
  if (!state && failed) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-4xl">🏐</span>
        <h1 className="font-display text-ink text-2xl font-extrabold tracking-widest uppercase">
          {pelada.name}
        </h1>
        <p className="text-muted">
          Não deu pra carregar a lista. Pode ser a rede daqui.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="font-display bg-accent text-accent-ink flex h-14 w-full max-w-[320px] items-center justify-center rounded-[12px] text-base font-extrabold tracking-widest uppercase"
        >
          tentar de novo
        </button>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="font-display text-muted h-12 text-sm tracking-widest uppercase"
        >
          ← outras peladas
        </button>
      </main>
    );
  }

  // pelada existe, mas ninguém abriu a noite ainda
  if (!state) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-4xl">🏐</span>
        <h1 className="font-display text-ink text-2xl font-extrabold tracking-widest uppercase">
          {pelada.name}
        </h1>
        <p className="text-muted">Ninguém abriu a lista de hoje ainda.</p>
        <button
          type="button"
          onClick={openTonight}
          disabled={opening}
          className="font-display bg-accent text-accent-ink flex h-14 w-full max-w-[320px] items-center justify-center rounded-[12px] text-base font-extrabold tracking-widest uppercase disabled:opacity-40"
        >
          {opening ? "abrindo…" : "abrir a lista de hoje"}
        </button>
        {openErr && <p className="text-live max-w-[320px] text-sm">{openErr}</p>}
        <button
          type="button"
          onClick={() => router.push("/")}
          className="font-display text-muted h-12 text-sm tracking-widest uppercase"
        >
          ← outras peladas
        </button>
      </main>
    );
  }

  // quem já escolheu o nome pula direto pro lobby
  if (!meId || !state.players.some((p) => p.id === meId)) {
    return (
      <>
        {account && (
          <AccountSheet
            onSaved={async () => {
              // logou: o jogador da conta pode já estar nesta pelada
              const mine = await myPlayerId();
              if (mine) {
                setMe(mine);
                setMeId(mine);
                setAccount(false);
              }
              await refresh();
            }}
            onClose={() => setAccount(false)}
          />
        )}
        <NamePicker
          players={state.players}
          peladaName={state.peladaName}
          allowGuests={state.settings.allowGuests}
          onAccount={() => setAccount(true)}
          onPick={(id) => void pick(id)}
          onBack={() => router.push("/")}
          onAddGuest={async (name) => {
            const id = await addGuest(state.peladaId, name);
            await refresh();
            if (id) {
              setMe(id);
              setMeId(id);
            }
          }}
        />
      </>
    );
  }

  return (
    <>
      {taken && (
        <div className="bg-live/15 border-live/40 mx-4 mt-3 rounded-[12px] border px-3 py-2.5">
          <p className="text-ink text-sm">
            Esse nome já está sendo usado em outro aparelho — aqui você
            acompanha, mas o check-in e o voto são de lá.{" "}
            <button
              type="button"
              onClick={() => {
                setTaken(false);
                setMeId(null);
              }}
              className="underline"
            >
              escolher outro
            </button>
          </p>
        </div>
      )}
      <Lobby state={state} stale={stale} meId={meId} refresh={refresh} />
    </>
  );
}
