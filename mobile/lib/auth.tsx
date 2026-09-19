import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type Me = {
  /** `auth.users.id` — a conta. */
  userId: string;
  /** `players.id` — o jogador dentro do app. É esse que a pelada usa. */
  playerId: string;
  name: string;
  email: string | null;
};

type AuthValue = {
  session: Session | null;
  me: Me | null;
  /** True enquanto a sessão guardada no aparelho ainda está sendo lida. */
  loading: boolean;
  /**
   * Tem sessão mas ainda não tem jogador — o estado normal de quem
   * acabou de se cadastrar. NÃO é pendência: nada no app é bloqueado por
   * isso. Serve pras telas que querem avisar ("sua conta ainda não joga
   * em nenhum grupo"), não pro porteiro.
   */
  precisaEscolherNome: boolean;
  /**
   * Como chamar quem ainda não tem jogador. Sai do cadastro, do Google
   * ou, em último caso, do e-mail — é o nome que vai pro `players` na
   * hora de criar ou entrar num grupo, e a pessoa pode trocar depois.
   */
  nomeDaConta: string;
  /**
   * A pessoa clicou no link de "esqueci a senha" e o app já plantou a
   * sessão de recuperação. Enquanto for `true`, o porteiro segura todo
   * mundo em `/nova-senha`: a sessão existe, mas serve pra uma coisa só.
   */
  recuperandoSenha: boolean;
  /** Recado do link que não deu certo (expirado, já usado). */
  avisoDoLink: string | null;
  limparAvisoDoLink(): void;
  /**
   * Devolve `true` quando o projeto exige confirmação de e-mail — não
   * veio sessão e a pessoa precisa abrir a caixa de entrada antes de
   * entrar. Não é erro, e tratar como erro era o defeito da versão
   * anterior: a tela pintava de vermelho um cadastro que deu certo.
   */
  signUpEmail(name: string, email: string, password: string): Promise<boolean>;
  signInEmail(email: string, password: string): Promise<void>;
  reenviarConfirmacao(email: string): Promise<void>;
  enviarLinkDeSenha(email: string): Promise<void>;
  trocarSenha(senha: string): Promise<void>;
  signInGoogle(): Promise<void>;
  signOut(): Promise<void>;
  refreshMe(): Promise<void>;
};

const Ctx = createContext<AuthValue | null>(null);

/**
 * Acha o jogador desta conta. **Não cria.**
 *
 * Até a F1 isto inseria um `players` novo com o prefixo do e-mail quando
 * não achava nada — e era o bug de identidade do app: a lista da semana
 * já tinha criado "Miguel", o Miguel logava, e nascia um segundo Miguel
 * sem nota, sem histórico e sem grupo nenhum.
 *
 * A ordem do mundo real é o contrário: a lista chega do WhatsApp ANTES
 * de qualquer conta existir. Então quem loga **reivindica** um nome que
 * já está lá (`claimPlayer`), ou entra por um convite do organizador
 * (`claimInvite`). Devolver `null` aqui é o estado normal do primeiro
 * login — e desde o fluxo self-service ele deixou de ser uma pendência
 * a resolver antes de entrar: a home aceita conta sem jogador, e virar
 * jogador é consequência de criar um grupo ou entrar em um
 * (`app/entrar/[code].tsx`).
 */
async function acharJogador(user: User): Promise<Me | null> {
  const { data, error } = await supabase
    .from("players")
    .select("id, name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    userId: user.id,
    playerId: data.id as string,
    name: data.name as string,
    email: user.email ?? null,
  };
}

/**
 * Lê o que o Supabase devolve no fim de uma URL de retorno.
 *
 * O projeto usa o fluxo `implicit` (padrão do supabase-js), então os
 * tokens chegam no **fragmento** (`#access_token=...`) — que o
 * `Linking.parse` não enxerga, porque pra ele fragmento não é query.
 * Daí a leitura dos dois lugares: fragmento primeiro, query como plano B
 * (é onde o erro costuma vir quando o link já morreu).
 */
function lerRetornoDeAuth(url: string) {
  const frag = new URLSearchParams(url.split("#")[1] ?? "");
  const q = (Linking.parse(url).queryParams ?? {}) as Record<string, unknown>;
  const pega = (k: string) =>
    frag.get(k) ?? (typeof q[k] === "string" ? (q[k] as string) : undefined) ?? undefined;
  return {
    tipo: pega("type"),
    access_token: pega("access_token"),
    refresh_token: pega("refresh_token"),
    erro: pega("error_description") ?? pega("error"),
  };
}

/** O erro do Supabase vem em inglês e em jargão; na quadra não serve. */
function traduzErroDeLink(erro: string): string {
  return /expired|invalid|already/i.test(erro)
    ? "Esse link de senha já venceu ou já foi usado. Peça outro."
    : erro;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [recuperandoSenha, setRecuperandoSenha] = useState(false);
  const [avisoDoLink, setAvisoDoLink] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (!data.session) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!alive) return;
      setSession(next);
      if (!next) {
        setMe(null);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  /**
   * O link de recuperação chega de FORA: a pessoa toca no e-mail e o
   * sistema abre o app. Não dá pra tratar como o Google, que volta pra
   * dentro do `openAuthSessionAsync` — aqui a URL entra pelo deep link,
   * no app frio (`getInitialURL`) ou já aberto (evento `url`).
   */
  useEffect(() => {
    let alive = true;

    async function tratar(url: string | null) {
      if (!url || !alive) return;
      const r = lerRetornoDeAuth(url);

      if (r.erro) {
        setAvisoDoLink(traduzErroDeLink(r.erro));
        return;
      }
      // Sem isto, o retorno do Google (que também passa por aqui em
      // alguns aparelhos) cairia no fluxo de troca de senha.
      if (r.tipo !== "recovery" || !r.access_token || !r.refresh_token) return;

      setAvisoDoLink(null);
      // Levanta a bandeira ANTES do await: o porteiro roda no mesmo
      // instante em que a sessão nasce, e sem a bandeira ele mandaria a
      // pessoa pra home com a senha velha ainda valendo.
      setRecuperandoSenha(true);

      const { error } = await supabase.auth.setSession({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      if (!alive) return;
      if (error) {
        setRecuperandoSenha(false);
        setAvisoDoLink(traduzErroDeLink(error.message));
      }
    }

    Linking.getInitialURL().then(tratar);
    const sub = Linking.addEventListener("url", (e) => tratar(e.url));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  // Sessão resolvida → procura quem sou eu. `me = null` com sessão viva é
  // o primeiro login: ainda não reivindiquei nome nenhum.
  useEffect(() => {
    let alive = true;
    if (!session?.user) return;
    setLoading(true);
    acharJogador(session.user)
      .then((m) => alive && setMe(m))
      .catch((e) => {
        console.warn("[auth] acharJogador falhou", e);
        if (alive) setMe(null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      me,
      loading,
      recuperandoSenha,
      avisoDoLink,
      limparAvisoDoLink: () => setAvisoDoLink(null),
      precisaEscolherNome: Boolean(session) && !me && !loading,
      nomeDaConta:
        me?.name ??
        (session?.user.user_metadata?.full_name as string | undefined) ??
        (session?.user.user_metadata?.name as string | undefined) ??
        session?.user.email?.split("@")[0] ??
        "Jogador",

      async signUpEmail(name, email, password) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: name.trim() },
            // Sem isto o link do e-mail aponta pra *Site URL* do projeto,
            // que é `http://localhost:3000` — um link morto no celular de
            // quem recebe. Aqui ele volta pro próprio app.
            //
            // Vale num build de verdade (`voleidagalera://auth-callback`).
            // No Expo Go isto vira `exp://192.168.x.x:8081/--/...`, e cliente
            // de e-mail em geral não abre esse esquema — pra testar no
            // aparelho, desligue *Confirm email* no painel do Supabase.
            //
            // A URL precisa estar em Auth → URL Configuration → Redirect
            // URLs, senão o Supabase ignora e cai na Site URL de novo.
            emailRedirectTo: Linking.createURL("/auth-callback"),
          },
        });
        if (error) throw error;
        // Sem sessão = o projeto exige confirmação de e-mail. Isso é um
        // caminho, não uma falha: a conta foi criada, e o que falta é a
        // pessoa abrir a caixa de entrada. Quem decide como contar isso
        // é a tela.
        return !data.session;
      },

      /**
       * Reenvia a confirmação do cadastro.
       *
       * O primeiro e-mail cai no spam, ou chega quando a pessoa já
       * fechou o app. Sem este botão a única saída era tentar criar a
       * conta de novo — e aí o Supabase responde "usuário já existe",
       * que é a pior frase possível pra quem está esperando um e-mail.
       */
      async reenviarConfirmacao(email) {
        const { error } = await supabase.auth.resend({
          type: "signup",
          email: email.trim(),
          options: { emailRedirectTo: Linking.createURL("/auth-callback") },
        });
        if (error) throw error;
      },

      /**
       * Manda o link de troca de senha. `redirectTo` aponta pro próprio
       * app — precisa estar em Auth → URL Configuration → Redirect URLs
       * no painel do Supabase, senão ele cai na Site URL (localhost) e o
       * link morre no celular de quem recebe.
       */
      async enviarLinkDeSenha(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: Linking.createURL("/nova-senha"),
        });
        if (error) throw error;
      },

      async trocarSenha(senha) {
        const { error } = await supabase.auth.updateUser({ password: senha });
        if (error) throw error;
        setRecuperandoSenha(false);
      },

      async signInEmail(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      /**
       * OAuth do Google sem servidor: abre o navegador do sistema, o
       * Supabase devolve os tokens no fragmento da URL de retorno e nós
       * plantamos a sessão à mão. `detectSessionInUrl` não serve aqui
       * porque não existe `window.location` no nativo.
       */
      async signInGoogle() {
        const redirectTo = Linking.createURL("/auth-callback");
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error) throw error;
        if (!data.url) throw new Error("Supabase não devolveu a URL do Google.");

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type !== "success") return; // usuário fechou o navegador

        const parsed = Linking.parse(result.url);
        const frag = new URLSearchParams(result.url.split("#")[1] ?? "");
        const q = parsed.queryParams ?? {};

        // O Google pode voltar com erro explícito — mostrar ele é muito
        // mais útil que "sem token".
        const oauthErr = (frag.get("error_description") ??
          frag.get("error") ??
          q.error_description ??
          q.error) as string | undefined;
        if (oauthErr) throw new Error(oauthErr);

        // Fluxo `implicit` (o padrão do supabase-js): tokens no fragmento.
        const access_token = frag.get("access_token") ?? (q.access_token as string);
        const refresh_token = frag.get("refresh_token") ?? (q.refresh_token as string);
        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (setErr) throw setErr;
          return;
        }

        // Fluxo `pkce`: volta `?code=` e o token é trocado num segundo passo.
        // Não é o padrão hoje, mas ligar PKCE no createClient não deve
        // quebrar o login em silêncio.
        const code = (frag.get("code") ?? q.code) as string | undefined;
        if (code) {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) throw exErr;
          return;
        }

        throw new Error(
          "O Google voltou sem token. Confira se a URL de redirect está liberada no Supabase (Authentication → URL Configuration).",
        );
      },

      async signOut() {
        await supabase.auth.signOut();
        setMe(null);
        setRecuperandoSenha(false);
      },

      async refreshMe() {
        if (session?.user) setMe(await acharJogador(session.user));
      },
    }),
    [session, me, loading, recuperandoSenha, avisoDoLink],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth fora do AuthProvider");
  return v;
}
