"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, LogOut, X } from "lucide-react";
import {
  claimPlayer,
  currentProfile,
  myPlayerId,
  saveProfile,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  syncPlayerFromProfile,
  uploadAvatar,
  type Profile,
} from "@/lib/auth";
import { getMe, setMe } from "@/lib/identity";
import { initials } from "@/lib/types";

/**
 * QUEM VOCÊ É.
 *
 * Junta três coisas que o playtest mostrou serem a mesma pergunta:
 *
 *   • "não é você?" — trocar de pessoa neste aparelho (alguém votou a
 *     noite inteira como outra pessoa);
 *   • cadastro com foto — pedido explícito, pra foto sair no Destaque;
 *   • reivindicar o jogador — criar conta não pode zerar seu histórico.
 *
 * A conta é OPCIONAL, e a tela deixa isso claro: dá pra fechar aqui e
 * continuar jogando como sempre.
 */
/**
 * O mínimo que a folha precisa saber de você.
 *
 * Não é `SessionPlayer` de propósito: esta tela também abre na home e na
 * escolha de nome, onde ainda não existe noite nenhuma pra ter jogador
 * de sessão.
 */
export type AccountPerson = { id: string; name: string; avatarUrl: string | null };

export function AccountSheet({
  me,
  onSwitchMe,
  onClose,
  onSaved,
}: {
  me?: AccountPerson;
  /** Trocar de pessoa neste aparelho. Ausente fora do lobby. */
  onSwitchMe?: () => void;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    currentProfile().then(setProfile).catch(() => setProfile(null));

    /**
     * Acabou de entrar na conta em outro aparelho? Traz o jogador dela.
     *
     * É pra isso que a conta existe: trocar de celular sem perder quem
     * você é. Se este aparelho ainda não sabe de ninguém, adota direto;
     * se sabe de OUTRA pessoa, não mexe — a tela oferece o botão, porque
     * roubar a identidade de quem emprestou o celular seria pior.
     */
    myPlayerId()
      .then((id) => {
        setClaimed(id);
        if (id && !getMe()) {
          setMe(id);
          void onSaved();
        }
      })
      .catch(() => setClaimed(null));
    // onSaved é estável na prática (vem do refresh do hook)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAccount = Boolean(profile && !profile.isAnonymous);
  const photo = me?.avatarUrl ?? profile?.avatarUrl ?? null;

  const doUpload = async (file: File) => {
    setBusy(true);
    setMsg(null);
    try {
      const url = await uploadAvatar(file);
      await saveProfile({ avatarUrl: url });
      await syncPlayerFromProfile({ avatarUrl: url });
      await onSaved();
      setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
      setMsg("Foto atualizada.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu pra subir a foto.");
    } finally {
      setBusy(false);
    }
  };

  const doClaim = async () => {
    if (!me) return;
    setBusy(true);
    try {
      const ok = await claimPlayer(me.id);
      setClaimed(ok ? me.id : null);
      setMsg(
        ok
          ? "Pronto: este histórico é seu."
          : "Esse jogador já tem dono. Fale com o organizador.",
      );
      await onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não deu pra reivindicar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border-border max-h-[92dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[16px] border-t px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-4 flex items-center">
          <h2 className="font-display text-ink text-xl font-extrabold tracking-widest uppercase">
            {/* sem conta e sem pessoa, "VOCÊ" não descreve nada — a folha
                é um convite, e o título tem que dizer o que ela faz */}
            {hasAccount || me ? "Você" : "Entrar"}
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

        {/*
          Foto + nome só quando há o que mostrar.
          Sem conta e sem pessoa isso aparecia como um avatar "?" com um
          "—" do lado e um botão de câmera que não fazia nada — três
          affordances mortas em cima do convite pra entrar.
        */}
        {(hasAccount || me) && (
          <div className="mb-5 flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!hasAccount || busy}
              className="border-border relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full border disabled:opacity-60"
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="size-full object-cover" />
              ) : (
                <span className="font-display text-muted text-xl font-bold">
                  {me ? initials(me.name) : "?"}
                </span>
              )}
              {/* o badge de câmera só existe se der pra trocar a foto */}
              {hasAccount && (
                <span className="bg-accent text-accent-ink absolute right-0 bottom-0 flex size-7 items-center justify-center rounded-full">
                  <Camera className="size-4" />
                </span>
              )}
            </button>

            <div className="min-w-0">
              <p className="font-display text-ink truncate text-lg font-extrabold tracking-wide uppercase">
                {me?.name ?? profile?.displayName ?? "sem nome ainda"}
              </p>
              {onSwitchMe ? (
                <button
                  type="button"
                  onClick={onSwitchMe}
                  className="text-muted text-sm underline"
                >
                  não é você? trocar de pessoa
                </button>
              ) : (
                <p className="text-muted text-sm">
                  {hasAccount
                    ? "toque na foto pra trocar — ela vai no Destaque do Dia"
                    : "escolha seu nome na lista da pelada"}
                </p>
              )}
            </div>

            {/* quem entrou na conta e tem jogador de outro aparelho */}
            {claimed && me && claimed !== me.id && (
              <button
                type="button"
                onClick={() => {
                  setMe(claimed);
                  location.reload();
                }}
                className="font-display text-accent ml-auto text-xs tracking-widest uppercase underline"
              >
                usar meu histórico aqui
              </button>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doUpload(f);
          }}
        />

        {msg && <p className="text-accent mb-3 text-sm">{msg}</p>}

        {hasAccount ? (
          <>
            {/* histórico: sem isso, criar conta zeraria a vida da pessoa */}
            {me && claimed !== me.id && (
              <button
                type="button"
                onClick={doClaim}
                disabled={busy}
                className="font-display bg-accent text-accent-ink mb-2 h-14 w-full rounded-[12px] text-base font-bold tracking-widest uppercase disabled:opacity-40"
              >
                sou eu — juntar meu histórico
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                await signOut();
                location.reload();
              }}
              className="font-display text-muted flex h-12 w-full items-center justify-center gap-2 text-sm tracking-widest uppercase"
            >
              <LogOut className="size-4" /> sair da conta
            </button>
          </>
        ) : (
          <>
            <p className="text-muted mb-3 text-sm">
              Criar conta é opcional — dá pra jogar a noite inteira sem. Serve
              pra sua foto aparecer no Destaque do Dia e pro seu histórico te
              seguir em qualquer aparelho.
            </p>

            {sent ? (
              <p className="text-accent mb-3 text-sm">
                Link enviado. Abre o e-mail neste mesmo celular.
              </p>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!email.trim() || busy) return;
                  setBusy(true);
                  setMsg(null);
                  try {
                    await signInWithEmail(email, window.location.href);
                    setSent(true);
                  } catch (err) {
                    setMsg(
                      err instanceof Error ? err.message : "Não deu pra enviar.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mb-2 flex gap-2"
              >
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu e-mail"
                  className="bg-surface-2 border-border text-ink placeholder:text-muted h-14 flex-1 rounded-[12px] border px-4 outline-none"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="font-display bg-accent text-accent-ink h-14 rounded-[12px] px-5 text-base font-extrabold tracking-widest uppercase disabled:opacity-40"
                >
                  entrar
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => signInWithGoogle(window.location.href)}
              className="font-display border-border text-ink h-14 w-full rounded-[12px] border text-base tracking-widest uppercase"
            >
              entrar com Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
