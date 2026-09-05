# Migrations

Não há ferramenta de migration aqui: cada arquivo é colado no **SQL Editor do
Supabase**, na ordem abaixo. O nome do arquivo é a única coisa que define a
ordem, então a lista aqui é a fonte da verdade.

## ⚠️ Três armadilhas, todas já nos morderam

**1. Nunca re-execute a `0001`.** Ela cria policies `<tabela>_open` com
`for all`, o que reabre a leitura dos votos e devolve o `DELETE` em `sessions` e
`players` — e apagar uma sessão leva a noite inteira junto pelo cascade. Já
aconteceu: os votos de uma pelada ficaram legíveis pela chave pública e a gente
só descobriu conferindo o banco. A `0001` é só para banco novo.

**2. As policies têm uma fonte da verdade, e ela é a última.** Hoje é a
**`0014_rls_roles.sql`**. Antes dela era a `0007`. Se o banco parecer estranho —
alguém lendo o que não devia, alguém apagando o que não devia — rode a `0014`
inteira: ela apaga toda policy e reescreve o estado desejado, e é idempotente.
Não tente remendar policy por policy.

**3. Havia duas `0002` e duas `0003`.** Duas sessões de trabalho em paralelo
criaram migrations com o mesmo número. A `0003_court_state.sql` era duplicata
exata da `0002_court_state.sql` (mesmas quatro colunas, `add column if not
exists`) e foi **removida**; o único trecho exclusivo dela era uma policy de
`DELETE` em `matches` que a `0004` e depois a `0014` substituíram. Restou uma
colisão inofensiva em `0002`, porque os dois arquivos são independentes
(um mexe em colunas, o outro em policies) e a ordem alfabética resolve.

## A ordem

| # | Arquivo | O que faz |
|---|---|---|
| 1 | `0001_init.sql` | schema inicial, RLS aberta, realtime. **Só em banco novo** |
| 2 | `0002_court_state.sql` | `players.rating`, `sessions.champion_ids/streak`, `matches.champion_stays` |
| 3 | `0002_rls_tighten.sql` | fecha o `select` dos votos; cria `highlight_tally()` |
| 4 | `0003_fix_rls.sql` | devolve o `insert` dos votos, que a anterior tinha deixado de fora |
| 5 | `0004_reset.sql` | `delete` em `matches` e votos, pro reset da noite funcionar |
| 6 | `0005_rounds_waiting.sql` | `session_players.rounds_waiting` |
| 7 | `0006_placar.sql` | `matches.score_a/score_b`, NULL-áveis de propósito |
| 8 | `0007_policies_reassert.sql` | reescreve todas as policies (superada pela `0014`) |
| 9 | `0008_highlight_days.sql` | `highlight_days()` — destaques por noite, agregados |
| 10 | `0009_highlight_voters.sql` | `highlight_voters()` — quem votou, sem em quem |
| 11 | `0010_placar_live.sql` | placar no banco: `bump_score`, `reset_score` |
| 12 | `0011_team_sides.sql` | lado do time: `holder_team`, `champion_team`, `swap_sides` |
| 13 | `0012_peladas.sql` | peladas, membros, nota por pelada; migra os dados existentes |
| 14 | `0013_auth_profiles.sql` | contas, foto, `claim_player`, `join_as_guest` |
| 15 | `0014_rls_roles.sql` | **fonte da verdade das policies** — papéis de verdade |
| 16 | `0015_stats.sql` | `player_stats`, `head_to_head`, destaques por pelada |
| 17 | `0016_substitutions.sql` | `joined_mid` / `substituted_for` |
| 18 | `0017_pelada_join_flow.sql` | `create_pelada`, `join_pelada`, `ensure_player` |
| 19 | `0018_votes_read_own.sql` | `votes_read_own` — a tela de destaques reabre marcada |
| 20 | `0019_votes_read_no_account.sql` | `highlight_votes_by` — reler o próprio voto sem conta |
| 21 | `0020_cast_votes_atomic.sql` | `cast_highlight_votes` — trocar o voto numa transação só |
| 22 | `0021_highlights_ties.sql` | empate na última vaga entra junto, em vez de cair por nome |

Quase todas são idempotentes (`add column if not exists`, `create or replace
function`, `drop policy if exists` antes de criar). A exceção que importa é a
`0001`, pelo motivo da armadilha 1.

## Depois de aplicar: o painel do Supabase

Migration não liga login. Em **Authentication → Sign In / Providers**:

- **Anonymous sign-ins** — obrigatório. A `0014` fechou a escrita por
  `auth.uid()`, então sem sessão anônima o check-in é recusado.
- **Google** — Client ID/Secret do Google Cloud Console, com
  `https://<projeto>.supabase.co/auth/v1/callback` cadastrado como redirect lá.
- **URL Configuration → Redirect URLs** — `https://volei-da-galera.vercel.app/**`
  e `http://localhost:3000/**`, senão magic link e Google voltam pro lugar errado.

## Conferindo o estado

```sql
-- policies: nenhuma linha com cmd=DELETE em sessions/players.
select tablename, cmd, policyname
from pg_policies where schemaname = 'public'
order by tablename, cmd;
```

A leitura do próprio voto NÃO passa por policy — passa pela
`highlight_votes_by` (0019). Se a tela de destaques reabrir em branco
pra quem já votou, é essa função que está faltando:

```sql
select proname from pg_proc where proname = 'highlight_votes_by';
```
