"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCircle, Users } from "lucide-react";
import { AccountSheet } from "./AccountSheet";
import { createPelada, fetchPeladas, joinPeladaByCode, type Pelada } from "@/lib/db";
import { currentProfile, ensureSession, myPlayerId } from "@/lib/auth";
import { getMe, setMe } from "@/lib/identity";

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/**
 * A CASA — de onde se escolhe a pelada.
 *
 * O v1 não tinha esta tela porque só existia uma pelada, implícita: quem
 * abria o site já caía no lobby da sexta. Com várias, a primeira
 * pergunta passa a ser "qual pelada" — e ela tem que ser respondida em
 * um toque pra quem já tem a sua (o caminho de 99% das noites).
 */
export function PeladaPicker() {
  const router = useRouter();
  const [peladas, setPeladas] = useState<Pelada[] | null>(null);
  const [mode, setMode] = useState<"list" | "new" | "join">("list");
  const [name, setName] = useState("");
  const [weekday, setWeekday] = useState<number>(5);
  const [code, setCode] = useState("");
  const [myName, setMyName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Já sabemos quem é a pessoa? Se não, ela precisa se apresentar. */
  const [known, setKnown] = useState(false);
  const [account, setAccount] = useState(false);
  /** Tem conta de verdade (não a sessão anônima)? */
  const [account0, setAccount0] = useState(false);

  useEffect(() => {
    // criar pelada e entrar por código são escritas: precisam de sessão
    void ensureSession();
    // quem já jogou tem jogador nesta conta (ou neste aparelho) e não
    // precisa digitar o nome de novo
    myPlayerId()
      .then((id) => setKnown(Boolean(id ?? getMe())))
      .catch(() => setKnown(Boolean(getMe())));
    currentProfile()
      .then((p) => setAccount0(Boolean(p && !p.isAnonymous)))
      .catch(() => setAccount0(false));
    fetchPeladas(getMe())
      .then(setPeladas)
      .catch(() => setPeladas([]));
  }, []);

  const open = (p: Pelada) => router.push(`/p/${p.slug}`);

  const mine = (peladas ?? []).filter((p) => p.myRole);
  const others = (peladas ?? []).filter((p) => !p.myRole);

  const card = (p: Pelada) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => open(p)}
        className="bg-surface border-border active:border-accent flex w-full items-center gap-3 rounded-[16px] border px-4 py-4 text-left"
      >
        <span className="text-2xl">🏐</span>
        <span className="min-w-0 flex-1">
          <span className="font-display text-ink block truncate text-lg font-extrabold tracking-wide uppercase">
            {p.name}
          </span>
          <span className="text-muted flex items-center gap-2 text-xs">
            {p.weekday !== null && <span>toda {WEEKDAYS[p.weekday]}</span>}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {p.memberCount}
            </span>
            {p.myRole === "owner" || p.myRole === "admin" ? (
              <span className="text-accent tracking-widest uppercase">organizador</span>
            ) : null}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <main className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-4 pt-10 pb-6">
      {/*
        A conta mora aqui em cima, na home.
        Ela existia só atrás do próprio nome no header do lobby — ou seja,
        quem ainda não tinha entrado em pelada nenhuma não tinha como se
        cadastrar. Feature entregue onde ninguém acha é feature que não
        foi entregue.
      */}
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setAccount(true)}
          className="font-display bg-surface border-border text-muted flex h-10 items-center gap-2 rounded-full border px-3 text-xs tracking-widest uppercase"
        >
          <UserCircle className="size-4" />
          {account0 ? "sua conta" : "entrar / criar conta"}
        </button>
      </div>

      <div className="mb-8 text-center">
        <div className="text-5xl">🏐</div>
        <h1 className="font-display text-ink mt-2 text-3xl font-extrabold tracking-widest uppercase">
          Vôlei da Galera
        </h1>
        <p className="font-display text-muted mt-3 text-sm tracking-widest uppercase">
          escolha a pelada
        </p>
      </div>

      {peladas === null ? (
        <p className="text-muted py-10 text-center">carregando…</p>
      ) : (
        <>
          {mine.length > 0 && (
            <>
              <h2 className="font-display text-muted mb-2 text-sm tracking-widest uppercase">
                Suas peladas
              </h2>
              <ul className="mb-6 flex flex-col gap-2">{mine.map(card)}</ul>
            </>
          )}

          {others.length > 0 && (
            <>
              <h2 className="font-display text-muted mb-2 text-sm tracking-widest uppercase">
                Outras peladas
              </h2>
              <ul className="mb-6 flex flex-col gap-2">{others.map(card)}</ul>
            </>
          )}

          {peladas.length === 0 && (
            <p className="text-muted mb-6 text-center">
              Nenhuma pelada ainda. Cria a sua.
            </p>
          )}
        </>
      )}

      {err && <p className="text-live mb-3 text-center text-sm">{err}</p>}

      {mode === "new" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim() || busy) return;
            if (!known && !myName.trim()) {
              setErr("Diz seu nome também — você vira o organizador dela.");
              return;
            }
            setBusy(true);
            setErr(null);
            try {
              // garante a sessão AQUI, não só no carregamento: sem ela a
              // RLS recusa a criação e o erro é ilegível
              await ensureSession();
              const p = await createPelada({
                name: name.trim(),
                weekday,
                ownerName: myName.trim() || null,
              });
              // o jogador acabou de nascer no banco: guarda quem você é
              // neste aparelho, senão o lobby pede o nome de novo
              const mine = await myPlayerId();
              if (mine) setMe(mine);
              if (p) router.push(`/p/${p.slug}`);
              else setErr("Não deu pra criar. Tenta outro nome.");
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Não deu pra criar.");
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome da pelada (ex: Vôlei da Sexta)"
            className="bg-surface border-border text-ink placeholder:text-muted h-14 rounded-[12px] border px-4 outline-none"
          />
          {/* primeira vez no site: ninguém sabe quem você é ainda, e a
              pelada precisa de dono */}
          {!known && (
            <input
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              placeholder="seu nome"
              className="bg-surface border-border text-ink placeholder:text-muted h-14 rounded-[12px] border px-4 outline-none"
            />
          )}
          <div className="flex gap-1.5">
            {WEEKDAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                onClick={() => setWeekday(i)}
                className={`font-display h-12 flex-1 rounded-[12px] text-sm tracking-widest uppercase ${
                  weekday === i
                    ? "bg-accent text-accent-ink font-bold"
                    : "bg-surface text-muted"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="font-display bg-accent text-accent-ink h-14 rounded-[12px] text-base font-extrabold tracking-widest uppercase disabled:opacity-40"
          >
            {busy ? "criando…" : "criar pelada"}
          </button>
          <button
            type="button"
            onClick={() => setMode("list")}
            className="font-display text-muted h-12 text-sm tracking-widest uppercase"
          >
            cancelar
          </button>
        </form>
      ) : mode === "join" ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!code.trim() || busy) return;
            if (!known && !myName.trim()) {
              setErr("Diz seu nome também, pra galera saber quem chegou.");
              return;
            }
            setBusy(true);
            setErr(null);
            try {
              await ensureSession();
              const p = await joinPeladaByCode(code, myName.trim() || null);
              // o jogador acabou de nascer no banco: guarda quem você é
              // neste aparelho, senão o lobby pede o nome de novo
              const mine = await myPlayerId();
              if (mine) setMe(mine);
              if (p) router.push(`/p/${p.slug}`);
              else setErr("Código não encontrado.");
            } catch (e) {
              setErr(e instanceof Error ? e.message : "Não deu pra entrar.");
            } finally {
              setBusy(false);
            }
          }}
          className="flex flex-col gap-2"
        >
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CÓDIGO"
            className="bg-surface border-border text-ink placeholder:text-muted h-14 rounded-[12px] border px-4 text-center text-xl tracking-[0.3em] outline-none"
          />
          {!known && (
            <input
              value={myName}
              onChange={(e) => setMyName(e.target.value)}
              placeholder="seu nome"
              className="bg-surface border-border text-ink placeholder:text-muted h-14 rounded-[12px] border px-4 outline-none"
            />
          )}
          <button
            type="submit"
            disabled={busy}
            className="font-display bg-accent text-accent-ink h-14 rounded-[12px] text-base font-extrabold tracking-widest uppercase disabled:opacity-40"
          >
            entrar
          </button>
          <button
            type="button"
            onClick={() => setMode("list")}
            className="font-display text-muted h-12 text-sm tracking-widest uppercase"
          >
            cancelar
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setMode("new")}
            className="font-display border-border text-ink flex h-14 items-center justify-center gap-2 rounded-[12px] border border-dashed text-base tracking-widest uppercase"
          >
            <Plus className="size-5" />
            criar pelada
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className="font-display text-muted h-12 text-sm tracking-widest uppercase"
          >
            entrar com código
          </button>
        </div>
      )}

      {account && (
        <AccountSheet
          onSaved={() => {
            setAccount0(true);
            setKnown(true);
          }}
          onClose={() => setAccount(false)}
        />
      )}
    </main>
  );
}
