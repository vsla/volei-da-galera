"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, UserCircle } from "lucide-react";
import { AccountSheet } from "@/components/AccountSheet";
import { currentProfile, ensureSession, type Profile } from "@/lib/auth";
import { claimRosterInvite, joinPeladaByCode } from "@/lib/db";

export function InviteJoin({ code }: { code: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = async () => {
    await ensureSession();
    setProfile(await currentProfile());
  };

  useEffect(() => {
    void loadProfile().catch(() => setProfile(null));
  }, []);

  const hasAccount = Boolean(profile && !profile.isAnonymous);
  const personalInvite = code.length > 10;

  const join = async (name?: string | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await ensureSession();
      const pelada = personalInvite
        ? await claimRosterInvite(code)
        : await joinPeladaByCode(code, name ?? null);
      if (!pelada) {
        setError("Esse convite não existe ou não é mais válido.");
        return;
      }
      router.replace(`/p/${pelada.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não deu pra entrar nessa pelada.");
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <span className="text-4xl">🏐</span>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col overflow-y-auto px-4 pt-6 pb-8">
      <button
        type="button"
        onClick={() => router.push("/")}
        className="text-muted -ml-2 mb-5 flex h-12 w-fit items-center gap-1 px-2 text-sm"
      >
        <ArrowLeft className="size-5" />
        minhas peladas
      </button>

      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="text-5xl">🏐</div>
          <h1 className="font-display text-ink mt-3 text-3xl font-extrabold tracking-widest uppercase">
            Entrar na pelada
          </h1>
          <p className="text-muted mt-3 text-sm">
            {personalInvite
              ? "Seu nome já está na lista. Aceite o convite neste aparelho; se você criar uma conta depois, o histórico continua com você."
              : "Você recebeu um convite. Quem já tem conta entra com o próprio histórico; quem veio só hoje pode continuar como convidado."}
          </p>
        </div>

        {error && (
          <p className="text-live mb-4 rounded-[12px] border border-current/30 px-3 py-2 text-sm">
            {error}
          </p>
        )}

        {personalInvite ? (
          <div className="bg-surface border-border rounded-[16px] border p-4">
            <p className="text-muted text-xs tracking-widest uppercase">
              convite individual
            </p>
            <p className="text-ink mt-2 text-sm">
              Você já foi colocado no elenco pelo organizador. Não precisa digitar seu nome de novo.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void join()}
              className="font-display bg-accent text-accent-ink mt-4 h-14 w-full rounded-[12px] text-base font-extrabold tracking-widest uppercase disabled:opacity-40"
            >
              {busy ? "entrando…" : "aceitar e entrar"}
            </button>
            {!hasAccount && (
              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="font-display text-muted mt-2 h-12 w-full text-sm tracking-widest uppercase"
              >
                criar conta antes
              </button>
            )}
          </div>
        ) : hasAccount ? (
          <div className="bg-surface border-border rounded-[16px] border p-4">
            <p className="text-muted text-xs tracking-widest uppercase">entrando como</p>
            <p className="font-display text-ink mt-1 text-xl font-extrabold tracking-wide uppercase">
              {profile?.displayName || "sua conta"}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void join(profile?.displayName)}
              className="font-display bg-accent text-accent-ink mt-4 h-14 w-full rounded-[12px] text-base font-extrabold tracking-widest uppercase disabled:opacity-40"
            >
              {busy ? "entrando…" : "entrar na pelada"}
            </button>
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="font-display text-muted mt-2 h-12 w-full text-sm tracking-widest uppercase"
            >
              usar outra conta
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              className="font-display bg-accent text-accent-ink flex h-14 w-full items-center justify-center gap-2 rounded-[12px] text-base font-extrabold tracking-widest uppercase"
            >
              <UserCircle className="size-5" />
              entrar / criar conta
            </button>
            <p className="text-muted my-4 text-center text-xs tracking-widest uppercase">
              ou, se você veio só hoje
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const name = guestName.trim();
                if (!name) {
                  setError("Diz seu nome pra galera saber quem entrou.");
                  return;
                }
                void join(name);
              }}
              className="bg-surface border-border rounded-[16px] border p-4"
            >
              <label className="text-muted mb-2 block text-xs tracking-widest uppercase">
                entrar sem conta
              </label>
              <input
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="seu nome"
                autoComplete="name"
                className="bg-surface-2 border-border text-ink placeholder:text-muted h-14 w-full rounded-[12px] border px-4 outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="font-display border-border text-ink mt-2 h-14 w-full rounded-[12px] border text-base font-bold tracking-widest uppercase disabled:opacity-40"
              >
                {busy ? "entrando…" : "continuar como convidado"}
              </button>
            </form>
          </>
        )}
      </div>

      {accountOpen && (
        <AccountSheet
          onSaved={async () => {
            await loadProfile();
            setAccountOpen(false);
          }}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </main>
  );
}
