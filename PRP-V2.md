# PRP v2 — de "a pelada da sexta" para plataforma de peladas

Plano de implementação depois do [`PLAYTEST-01.md`](./PLAYTEST-01.md).

---

## Status — implementado

**F0 a F7 estão escritas e no repositório.** O que foi verificado localmente:
`npx tsc --noEmit` limpo, `npx vitest run` com **62 testes** passando (eram 51) e
`next build` sem warning.

O que **não** foi verificado, e por que: as migrations `0010`–`0016` não foram
aplicadas em nenhum banco por aqui, e a F4 depende de configuração no painel do
Supabase (habilitar *Anonymous sign-ins*, provider do Google). Então o caminho
ponta a ponta — RLS fechada + realtime + login — só está validado por leitura de
código e pelo `npm run smoke`, que precisa rodar contra o Supabase de verdade
**depois** de aplicar as migrations.

Ordem de subida (também no README): aplicar `0010`–`0013` **e a `0017`** →
habilitar login anônimo → **deploy** → aplicar `0014` → conferir a tela ao vivo
com dois aparelhos → aplicar `0015`/`0016`.

**Segunda correção depois do uso real: a conta estava inalcançável.** Login com
e-mail e Google, foto e reivindicação de jogador existiam desde a F4 — mas só
abriam tocando no próprio nome no header do lobby, o que exige já estar dentro de
uma pelada e já ter escolhido um nome. Quem abria o site pela primeira vez não
tinha como se cadastrar. Agora a conta abre de três lugares (home, "quem é
você?" e lobby), e entrar nela traz seu jogador de volta no aparelho novo
(`reasonable.md` §15b). O provider do Google ainda precisa ser configurado no
painel do Supabase — isso não é código.

**Correção depois do primeiro uso real (`0017`).** Criar pelada estourava com
`new row violates row-level security policy for table "peladas"`. Eram dois
defeitos: sem sessão o insert é recusado (login anônimo desligado), e — pior —
criar pelada eram **dois inserts do cliente**, sendo que o segundo (virar dono)
mandava um id de localStorage que não é o `current_player_id()` da conta. A
`0017` move criar/entrar pra funções do banco (`create_pelada`, `join_pelada`,
`ensure_player`), o cliente passou a garantir a sessão no momento do clique, e
toda escrita que antes ignorava o `error` agora fala. A lição virou regra no
`reasonable.md` §9: **escrita que depende de outra escrita mora numa função do
banco.**

O que ficou de fora, de propósito:

- **`/perfil` como tela própria** — o que ela teria está no `AccountSheet` (foto,
  conta, seu histórico) e em `/p/<slug>/stats`. Uma terceira tela repetiria as
  duas;
- **exportar CSV** do painel — nada no playtest pediu, e é fácil de somar depois;
- **reproduzir o §10 do playtest** ("ver outra partida com o jogo finalizado"):
  o relato está ambíguo. O que dava pra fechar sem adivinhar foi fechado —
  partida encerrada agora é somente leitura no banco (`bump_score` e
  `reset_score` só aceitam `status = 'active'`) e a tela não deixa registrar
  vencedor sem partida ativa.

---

O v1 assumiu **uma pelada, implícita**: uma sessão por data, todo mundo na mesma
lista de nomes, nota global, organizador por PIN. Cada pedido novo do playtest
(criar pelada, papéis, painéis, foto, estatísticas) esbarra nessa suposição. Por
isso o v2 refaz o modelo — mas **sem jogar fora o que foi validado na areia**: a
fila, a rotação, o gerador e as decisões do `reasonable.md` continuam
exatamente como estão.

> **Regra de ouro do v2.** `match-generator.ts` e `rotation.ts` continuam sendo
> funções puras, sem banco e sem UI, com os 51 testes verdes. Multi-pelada é
> mudança de *contexto* (de onde vêm os jogadores e as configurações), não de
> *regra*. A única regra que muda é o lado do time (F2) — e essa muda com teste.

---

## 1. Modelo de dados

### 1.1 O que existe hoje

```
players(id, name, avatar_url, is_guest, rating)          ← rating GLOBAL
sessions(id, date UNIQUE, status, team_size, max_streak) ← uma por data, global
session_players(session_id, player_id, checked_in_at, games_played,
                last_played_at, rounds_waiting, excluded)
matches(id, session_id, round, status, winner_team, champion_streak,
        champion_stays, score_a, score_b, seed)
match_players(match_id, player_id, team, locked)
highlight_votes(session_id, voter_id, player_id)
```

### 1.2 O que passa a existir

```
profiles(id = auth.users.id, display_name, avatar_url, created_at)
  └─ conta de verdade. Foto mora aqui (Supabase Storage).

players(id, name, avatar_url, is_guest, user_id → profiles.id NULL UNIQUE)
  └─ a PESSOA na quadra. Convidado sem conta continua existindo (user_id NULL).
     `rating` SAI daqui.

peladas(id, slug UNIQUE, name, cover_url, timezone, weekday, settings jsonb,
        created_by, created_at)
  └─ "Vôlei da Sexta". Uma pelada tem N sessões (uma por noite).

pelada_members(pelada_id, player_id, role, status, rating, joined_at)
  role  ∈ owner | admin | player | guest
  rating float default 5   ← a nota passa a ser POR PELADA
  status ∈ active | invited | removed
  PK (pelada_id, player_id)

sessions(id, pelada_id, date, status, settings jsonb, ...)
  UNIQUE (pelada_id, date)   ← era UNIQUE(date) global

matches(… + holder_team, side_a, score_updated_at)
match_players(… + joined_mid, substituted_for, left_at)
```

Tabelas que **não mudam de forma**: `session_players`, `highlight_votes` (ganham
escopo de pelada de graça, via `session_id`).

### 1.3 As três decisões de modelagem que importam

**a) A nota é por pelada, não por pessoa.**
Hoje `players.rating` é global. Com várias peladas, sua nota no vôlei da sexta
não diz nada sobre o vôlei de domingo — e pior, elas se misturariam. Vai pra
`pelada_members.rating`. O `reasonable.md` §3 continua valendo dentro de cada
pelada.

**b) `players` ≠ `profiles`.**
Convidado sem conta é caso normal (`RESUMO.md`: "login não pode custar mais que
um toque"). Então a pessoa em quadra é `players`, e a conta é opcional
(`players.user_id`). Quem cria conta depois **reivindica** o `player` existente
— sem isso, o histórico de todo mundo zeraria no dia do login.

**c) Configuração é `jsonb` com herança pelada → sessão.**
`peladas.settings` é o padrão; `sessions.settings` sobrescreve o que a noite
precisar. Uma coluna nova por config vira uma migration por ajuste de regra, e
o pedido do playtest foi explicitamente "deixar mais configurável".

```ts
type PeladaSettings = {
  teamSize: number;              // 6
  maxStreak: number;             // 2
  waitCap: number | null;        // teto de espera: entra na marra após N (§F5)
  substitutionMode: "titular" | "tapa_buraco";
  teams: { a: { label: string; color: string }; b: { … } };  // LIMA / AZUL
  fixedSides: boolean;           // quem fica mantém o lado
  scoring: { enabled: boolean; pointsToWin: number | null };
  votesPerPlayer: number;        // 3
  showRating: "organizers" | "everyone" | "nobody";
  whoCanGenerate: "admins" | "anyone";
  allowGuests: boolean;
};
```

---

## 2. Auth, papéis e RLS

Hoje: RLS aberta, publishable key no bundle, PIN barra na tela e não no banco
(`reasonable.md` §9, decisão consciente). Com contas e várias peladas isso deixa
de ser aceitável — "amigos numa praia" vira "grupos que não se conhecem".

**Auth.** Supabase Auth: magic link + OAuth (Google/Apple).
**Convidado.** *Anonymous sign-in* do Supabase: todo aparelho tem `auth.uid()`,
mesmo sem cadastro. Isso é o que torna a RLS possível **sem** quebrar o
1-toque — o convidado tem sessão, só não tem identidade verificada. Depois ele
faz upgrade da conta anônima pra conta real e mantém o `player_id`.

**Papéis (por pelada).**

| ação | owner | admin | player | guest |
|---|:--:|:--:|:--:|:--:|
| ver a pelada ao vivo | ✓ | ✓ | ✓ | ✓ |
| check-in de si mesmo | ✓ | ✓ | ✓ | ✓ |
| votar nos Destaques | ✓ | ✓ | ✓ | ✓ |
| marcar placar | ✓ | ✓ | config | — |
| gerar partida / registrar vencedor | ✓ | ✓ | config | — |
| check-in/remoção de outros, substituir | ✓ | ✓ | — | — |
| editar configurações da pelada | ✓ | ✓ | — | — |
| gerenciar membros e papéis | ✓ | ✓ | — | — |
| apagar a pelada, transferir posse | ✓ | — | — | — |

**RLS.** Duas funções `security definer` sustentam tudo:

```sql
is_member(p_pelada uuid) returns boolean
is_pelada_admin(p_pelada uuid) returns boolean   -- owner | admin
```

Escrita de organizador passa a ser barrada **no banco**, não na tela. O PIN some
como mecanismo de autorização e sobrevive só como atalho de "virar organizador
neste aparelho" quando o dono não está com a conta à mão.

⚠️ **Realtime respeita RLS.** Fechar as policies sem revisar os canais quebra a
tela ao vivo — que é o produto. Isso tem um passo de verificação próprio na F4.

---

## 3. Fases

Cada fase é entregável sozinha. **F0 e F1 devem estar em produção antes da
próxima pelada** — são o conserto do que atrapalhou.

### F0 — Consertos que não precisam de schema  ⏱ ~1 dia

| # | O quê | Onde |
|---|---|---|
| 1 | `fora N` conta a partida em andamento (exibição) | `Queue.tsx`, `Lobby.tsx` |
| 2 | Bloco fixo "ENTRAM NA PRÓXIMA" com os 6, acima da fila | `Queue.tsx` novo `NextUpStrip` |
| 3 | `nextUpIds` sempre visível, mesmo com a fila colapsada | `Queue.tsx` |
| 4 | Teclado numérico próprio no PIN (bug Android) | `OrganizerSheet.tsx` |
| 5 | Partida `finished` é somente leitura; placar fecha ao registrar | `Lobby.tsx`, `Scoreboard.tsx` |
| 6 | Placar visível na home (leitura) mesmo pra quem não marca | `CourtCard.tsx` |

Detalhe do (1): a regra do banco **não muda** — só a exibição soma `+1` pra quem
está de fora enquanto existe partida ativa. Testar com `roundsWaiting` cru vs
exibido, pra não regredir a regra de `rotation.ts`.

Detalhe do (2): mostrar os 6 é correto porque a rotação sempre gira exatamente
`teamSize` (`reasonable.md` §8). Rótulo "prováveis" porque o desempate entre
empatados em jogos pode trocar nomes.

### F1 — Placar ao vivo, entre aparelhos  ⏱ ~1 dia
`0010_placar_live.sql`

- `matches.score_a/score_b` deixam de ser só o resultado final: são o placar
  corrente. `+ score_updated_at`.
- RPC `bump_score(p_match uuid, p_team text, p_delta int)` — incremento
  **atômico** no banco. Dois marcadores não se sobrescrevem (com update de
  objeto inteiro, o último a escrever apagaria o ponto do outro).
- `Scoreboard.tsx`: otimista local + `bump_score`, e `localStorage` vira apenas
  fila de reenvio offline.
- Placar entra no `fetchState` → propaga pelo realtime que já existe
  (`matches` já está na publicação).
- Empate continua não fechando partida.

### F2 — Lado do time  ⏱ ~1 dia
`0011_team_sides.sql`

- `matches.holder_team text` — qual letra está segurando a quadra.
- `rotation.ts`: `applyMatchResult` devolve **em qual lado** o campeão fica;
  cai a invariante "staying é sempre A".
- `match-generator.ts`: monta o desafiante no lado oposto ao do campeão.
- UI: times por **cor/label configurável** (padrão `LIMA` × `AZUL`) em vez de
  A/B em `CourtCard`, `Scoreboard`, `NextUpSheet`, `ConfirmSheet`, `HistorySheet`.
- Botão **"trocar lados"** do organizador.
- Testes novos: *"o time que fica mantém o lado"*, *"o desafiante entra no lado
  oposto"*, *"trocar lados não mexe em quem fica"*.

⚠️ Maior risco de regressão do plano — os testes de rotação atuais assumem
`staying = A` em vários pontos.

### F3 — Multi-pelada  ⏱ ~3 dias
`0012_peladas.sql`

- Tabelas `peladas`, `pelada_members`; `sessions.pelada_id`;
  `UNIQUE(pelada_id, date)`.
- **Migração dos dados atuais**: cria a pelada "Vôlei da Sexta — Prainha ZN",
  liga todas as sessões nela, converte todo `players` em `pelada_members` com
  `rating` copiado de `players.rating`, e depois derruba `players.rating`.
- Rotas: `/` = minhas peladas · `/p/[slug]` = o lobby de hoje · `/p/[slug]/[date]`.
- `fetchState(peladaId)`, `useLiveSession(peladaId)` — o hook deixa de assumir
  "a sessão mais recente do banco".
- Criar pelada (nome, dia da semana, tamanho de time) e entrar por link/código.

### F4 — Contas, foto e RLS  ⏱ ~3 dias
`0013_auth_profiles.sql`, `0014_rls_roles.sql`

- Supabase Auth (magic link + OAuth) e **anonymous sign-in** pro convidado.
- `profiles` + upload de foto (Supabase Storage, bucket público, resize no
  cliente — 4G de praia não sobe foto de 4 MB).
- **Reivindicação de jogador**: ao logar, "você é o João da lista?" para o
  histórico não zerar.
- Papéis por pelada, `is_member`/`is_pelada_admin`, policies reescritas
  (a `0014` é a nova fonte da verdade, idempotente, como a `0007` é hoje).
- Foto aparece no Destaque do Dia (`Highlights`, `ShareCard`, `/api/og`).
- ✅ Verificação obrigatória: com RLS fechada, dois aparelhos ainda veem a
  mesma quadra ao vivo (canal realtime de `sessions`, `session_players`,
  `matches`, `match_players`).

### F5 — Painéis e configuração  ⏱ ~2 dias

- `/p/[slug]/admin`: membros e papéis · configurações · sessões · histórico ·
  reset · exportar CSV.
- Editor de `PeladaSettings` inteiro (§1.3) — inclusive `waitCap`, o teto de
  espera que responde ao "ficaram 3 rodadas fora".
- **"Nivelar a noite"** entre partidas: desfaz o campeão e remonta os 12
  priorizando quem está fora há mais tempo.
- Painel do jogador: minhas peladas, meus jogos, meu perfil.

### F6 — Estatísticas  ⏱ ~2 dias
`0015_stats.sql`

O pedido foi literal: *"estatísticas que você pode montar, tipo 'ganhei todas de
fulaninho'"*.

- Views/RPC sobre `match_players` + `matches` (o dado já existe desde o v1):
  - `player_stats(pelada_id, player_id, range)` — jogos, vitórias, %, maior
    sequência, destaques recebidos
  - `head_to_head(a, b)` — juntos vs. contra, vitórias de cada lado
  - `pelada_leaderboard(pelada_id, range)`
- Tela `/p/[slug]/stats` com seletor "eu × alguém" — é a feature que rende
  resenha no grupo, e ela é **derivada**, não precisa de dado novo.
- Votação: aviso ao encerrar com gente faltando + copiar a lista de quem falta.

### F7 — Substituição configurável  ⏱ ~1 dia
`0016_substitutions.sql`

- `match_players.joined_mid`, `substituted_for`, `left_at` — hoje o `update` de
  `player_id` destrói a informação de quem começou.
- `substitutionMode: "tapa_buraco"`: quem entrou no meio não conta o jogo e não
  herda a vaga na quadra; se o time fica, o titular volta.
- Testes em `rotation.ts` pros dois modos.

---

## 4. Ordem, e o que pode ser cortado

```
F0 ─ F1 ─ F2 ──┐
               ├─ F3 ─ F4 ─ F5 ─ F6 ─ F7
   (rodável já)     (plataforma)
```

- **F0 + F1 + F2 rodam a próxima pelada** sem nada da plataforma. Se o tempo
  apertar, é isso que vai pro ar.
- **F3 e F4 andam juntas na prática** — multi-pelada sem papéis fica com
  qualquer um editando a pelada dos outros. Não subir F3 em produção sem F4.
- F6 e F7 são cortáveis; F5 é o que faz o organizador parar de pedir coisa
  pra você.

---

## 5. Riscos

| Risco | Mitigação |
|---|---|
| **RLS fechada quebra o realtime** — e o realtime é o produto | Passo de verificação próprio na F4, com dois aparelhos, antes de subir |
| **F2 regride a rotação** | Testes antes do código; os 51 atuais têm que passar ou ser reescritos conscientemente |
| **Migração perde histórico/nota** | A `0012` copia `players.rating` → `pelada_members.rating` **antes** de derrubar a coluna; migration com `begin/commit` e conferência de contagem |
| **Login afasta o convidado** | Anonymous sign-in: check-in continua a 1 toque, conta é opcional |
| **Escopo** | F0–F2 são independentes e vão pro ar sozinhas |
| **4G da praia** (risco herdado do v1) | Placar otimista + fila de reenvio; foto com resize no cliente |

---

## 6. Perguntas em aberto

1. **"Tá podendo ver outra partida com o jogo finalizado"** — o relato está
   ambíguo (`PLAYTEST-01` §10). Reproduzir no próximo playtest antes de
   consertar às cegas.
2. **Convidado numa pelada privada** — entra por link, por código, ou precisa de
   aprovação do admin? Muda a UX de convite na F3.
3. **Uma pessoa em várias peladas** — o mesmo `player` é compartilhado entre
   peladas (nota separada, histórico junto) ou cada pelada tem o seu? O plano
   assume **compartilhado**, com nota por pelada.
4. **Placar acumulado da noite** — vale somar pontos feitos por jogador ao longo
   da pelada, ou só o placar por partida? A F6 entrega o placar por partida; o
   acumulado é fácil de somar depois, se a galera pedir.
