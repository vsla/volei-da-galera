# Vôlei da Galera — app nativo

Expo + expo-router, apontando pro **mesmo Supabase** que a web usa.

## Rodar

Precisa de Node 22 (o RN 0.86 exige ≥ 20.19.4; o `.nvmrc` já fixa a versão):

```bash
nvm use            # 22.21.1
npm install
npm start
```

Abre o **Expo Go** no celular e escaneia o QR. Celular e computador na mesma rede.

> `npx` está quebrado nesta máquina (roteia pra `npm`). Use `npm exec -- <cmd>`.

## Vocabulário

O modelo de dados já existia; aqui ele ganhou o nome que a galera usa.

| Tela | Tabela |
| --- | --- |
| **Grupo** — a turma fixa, membros e admins | `peladas` |
| **Pelada** — a noite de hoje, check-in e jogos | `sessions` |
| Elenco do grupo | `pelada_members` (`role`: owner/admin/player/guest) |
| Pessoa | `players` (`user_id` liga à conta) |

## Estrutura

```
app/
  _layout.tsx           AuthProvider + porteiro (sem conta → /login)
  login.tsx             e-mail/senha + Google
  index.tsx             Meus grupos
  criar-grupo.tsx       modal
  entrar-codigo.tsx     modal
  grupo/[id]/
    _layout.tsx         abas: Pelada · Lista · Grupo
    index.tsx           quadra, placar, fila, gerar/encerrar rodada
    lista.tsx           abrir a pelada de hoje, check-in, convidado avulso
    gestao.tsx          membros, admins, código de convite
lib/
  supabase.ts           cliente RN (sessão persistente no AsyncStorage)
  auth.tsx              conta → `players` (`ensurePlayer`)
  grupo-ctx.tsx         um poll de 5s compartilhado pelas 3 abas
  useLive.ts            estado da noite + `hojeSP()`
  db.ts, match-generator.ts, rotation.ts, teams.ts, settings.ts, types.ts
```

**`lib/db.ts` e os arquivos de lógica são cópia de `../src/lib/`.** Eles não
importam nada de React/Next/DOM, então foram reaproveitados inteiros — inclusive
o gerador de partidas, que tem 941 linhas de teste do lado da web. Só
`supabase.ts` diverge (sessão persistente aqui, nenhuma na web).

Duplicação consciente, pra não mexer em config do Metro no dia do teste. Quando
estabilizar, vale extrair pra um pacote compartilhado — e aí os testes da web
passam a cobrir o app também.

## O que falta

- **Google login** precisa do OAuth client no Google Cloud + provider ligado no
  Supabase, com `voleidagalera://auth-callback` (e a URL `exp://…` do Expo Go)
  nas redirect URLs. O botão já está pronto; sem isso ele devolve erro.
- **Convite por deep link.** Hoje é código de 6 caracteres (`peladas.join_code`).
- **Destaques, stats e histórico** continuam só na web.
- **RLS.** As policies estão em `true` pra `anon` e `authenticated` desde a
  `0022`. O login do app é real, mas o banco ainda não o exige — qualquer um com
  a chave publishable escreve em qualquer tabela. Fechar isso é o próximo passo
  de segurança, e não dá pra fazer junto com um teste em quadra.
