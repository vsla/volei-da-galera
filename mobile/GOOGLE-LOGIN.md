# Ligar o "Continuar com Google"

O botão já existe em `app/login.tsx` e o handler está em `lib/auth.tsx`. Falta
só a configuração — 3 painéis, ~10 minutos.

**A ideia do fluxo:** o app abre o navegador → Google → Google volta pro
**Supabase** → Supabase volta pro **app**. Por isso o Google só conhece a URL do
Supabase, e o Supabase é quem precisa conhecer a URL do app.

---

## 1. Google Cloud Console — criar o OAuth client

<https://console.cloud.google.com/>

1. Cria (ou escolhe) um projeto no seletor lá em cima.
2. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - App name: `Vôlei da Galera` · e-mail de suporte: o teu · e-mail do
     desenvolvedor: o teu → Save and continue
   - Scopes: não mexe → Save and continue
   - **Test users → + ADD USERS**: põe o teu Gmail (e o de quem for testar hoje).

   > ⚠️ Enquanto o app estiver em **Testing**, só quem está nessa lista
   > consegue logar. Todo mundo fora dela toma "acesso bloqueado". Pra abrir
   > geral é o botão **Publish app** — mas pra hoje a lista de teste basta.

3. **APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth client ID**
   - Application type: **Web application** ← *não* é iOS nem Android.
     O redirect acontece no servidor do Supabase, então o cliente é "web"
     mesmo sendo app nativo. Escolher iOS aqui é o erro nº 1.
   - Name: `Supabase — Volei da Galera`
   - **Authorized JavaScript origins:**
     ```
     https://ypvsvwsftizqmidmcpje.supabase.co
     ```
   - **Authorized redirect URIs:**
     ```
     https://ypvsvwsftizqmidmcpje.supabase.co/auth/v1/callback
     ```
   - Create → guarda o **Client ID** e o **Client secret**.

---

## 2. Supabase — ligar o provider

<https://supabase.com/dashboard/project/ypvsvwsftizqmidmcpje/auth/providers>

1. **Authentication → Sign In / Providers → Google**
2. Liga o **Enable Sign in with Google**
3. Cola o **Client ID** e o **Client Secret** do passo 1
4. Save

---

## 3. Supabase — liberar a volta pro app

É o passo que todo mundo esquece. Sem ele o Supabase ignora o `redirectTo` e
manda pro Site URL — o app abre o navegador, loga, e nunca volta.

<https://supabase.com/dashboard/project/ypvsvwsftizqmidmcpje/auth/url-configuration>

**Authentication → URL Configuration → Redirect URLs → Add URL**, uma por vez:

```
voleidagalera://auth-callback
exp://192.168.15.2:8081/--/auth-callback
```

- A primeira é o app de verdade (build nativo) — usa o `scheme` do `app.json`.
- A segunda é o **Expo Go**, que não tem scheme próprio: ele usa `exp://` +
  o IP da tua máquina.

> ⚠️ **Esse IP muda** quando tu troca de rede (casa → praia → 4G). Quando
> mudar, o login do Google para de voltar. Duas saídas:
> - cadastrar o wildcard `exp://*/--/auth-callback` junto; ou
> - rodar `npm start --tunnel` (URL fixa `exp://*.exp.direct`, mais lento).
>
> Pra hoje, o mais simples é cadastrar o wildcard **e** o IP atual.

---

## 4. Testar

```bash
npm start
```

Expo Go → **Continuar com Google**. O navegador abre, tu escolhe a conta, ele
fecha sozinho e cai na tela **Meus grupos**.

---

## Quando der errado

| O que aparece | O que é |
| --- | --- |
| `Acesso bloqueado: ... não concluiu o processo de verificação` | Teu Gmail não está em **Test users** (passo 1.2). |
| `Error 400: redirect_uri_mismatch` | A **Authorized redirect URI** no Google não bate exatamente com `https://ypvsvwsftizqmidmcpje.supabase.co/auth/v1/callback`. Confere barra final e `http` vs `https`. |
| `O Google voltou sem token...` | Falta a URL `exp://…` nos **Redirect URLs** do Supabase (passo 3), ou o IP mudou. |
| O navegador fecha e não acontece nada | `result.type !== "success"` — normalmente é fechar o navegador na mão. Tenta de novo. |
| `Unsupported provider: provider is not enabled` | O passo 2 não foi salvo. |

O tratamento de erro fica em `signInGoogle`, em `lib/auth.tsx` — ele já mostra
o `error_description` que o Google devolve, então a mensagem na tela costuma
ser a causa real.
