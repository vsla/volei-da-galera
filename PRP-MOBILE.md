# PRP Mobile — o resto do app no celular

Transpor pro `mobile/` o que hoje só existe na web.

---

## A descoberta que muda o tamanho do trabalho

A camada de dados **já está inteira no mobile**. Byte a byte:

| arquivo | `src/lib/` vs `mobile/lib/` |
| --- | --- |
| `db.ts` (47,6K) | idêntico |
| `match-generator.ts` (21,0K) | idêntico |
| `rotation.ts`, `settings.ts`, `teams.ts`, `types.ts`, `rng.ts` | idênticos |

Então isto **não é uma porta de lógica — é uma porta de tela.** Das 40 funções
exportadas do `db.ts`, **23 não têm uma única chamada** no `mobile/`:

| bloco | funções paradas | tela na web |
| --- | --- | --- |
| mexer ao vivo | `movePlayer` `swapPlayer` `swapSides` | `Queue`, `PlayerSheet`, `CourtCard` |
| sair / voltar | `leaveSession` `rejoinSession` | `Lobby` |
| organizador | `resetScore` `resetSession` `reopenSession` | `ResetSheet`, `OrganizerSheet` |
| regras | `savePeladaSettings` | `AdminPanel`, aba regras |
| lista da semana | `addMembers` `syncMembers` | `ListaDaSemana` |
| destaques | `openVoting` `castVotes` `myVotes` `closeVoting` `fetchVoters` `fetchHighlights` `fetchHighlightDays` | `Highlights`, `/destaques` |
| estatísticas | `fetchPlayerStats` `fetchHeadToHead` | `StatsPanel`, `/stats` |
| histórico | `fetchDayMatches` | `HistorySheet` |
| roteamento por slug | `fetchPeladaBySlug` `playerExists` | rotas `/p/[slug]` |

O mobile tem 1.607 linhas em 9 telas. A web tem 25 componentes, e só o `Lobby`
tem 27,6K. A conta não fecha por acaso: o `mobile/` nasceu numa tarde, dia
18/09, pra ser testado na praia naquela noite.

---

## 0. O problema que precede tudo: **os arquivos duplicados**

Aqueles seis arquivos idênticos não estão compartilhados — estão **copiados**.
Duas cópias de `db.ts` com 47,6K cada, e nada obrigando as duas a andarem
juntas. Elas já quase divergiram: a correção do `join_pelada` (`0024`) valia pros
dois lados, e só funcionou porque os dois arquivos ainda eram iguais.

Enquanto isso for cópia, "transpor tudo pro mobile" é um trabalho que precisa
ser feito **de novo a cada mudança**, pra sempre. E o teste (`vitest`, 81 verdes)
roda só na cópia da web — a do mobile não é testada por nada.

**Antes de portar tela nenhuma, os dois viram um só.** Um `shared/` na raiz,
importado pelos dois (`@/lib/*` na web, `../../shared/*` no mobile, ou um
workspace npm). É meia hora de trabalho que se paga na primeira semana, e é a
diferença entre um app e dois apps que se parecem.

Isto é a **F0** e não é negociável pelo resto do plano: as fases abaixo assumem
que existe um lugar só.

---

## 1. Identidade — o "pensa um pouco mais"

Você respondeu: *"todo mundo tem que ter conta, daí o organizador vai adicionar
quem vai na pelada — assim fica mais fácil e seguro, mas pensa um pouco mais."*

Pensei. O modelo **funciona**, e a peça que falta já está no banco. Mas duas das
três palavras precisam de conversa.

### 1.1 O modelo está certo na ordem das coisas

A lista chega do WhatsApp **antes** de qualquer conta existir. O organizador cola
15 nomes sexta de manhã; o Miguel talvez instale o app na sexta à noite, talvez
nunca. Então `players` nasce **sem dono**, e a conta chega depois — se chegar.

Isso significa que o primeiro login de cada pessoa precisa **reivindicar** o
jogador que já existe, em vez de criar outro. Hoje o mobile faz o contrário:
`mobile/lib/auth.tsx:63` procura por `user_id`, não acha, e **insere um jogador
novo** com o prefixo do e-mail. É por isso que entrar no app hoje te duplica.

**A função pra isso já existe e sobreviveu a tudo:**

```sql
-- claim_player(p_player uuid) → boolean   [0013, ainda no banco, security definer]
--   sem sessão            → false
--   já tem jogador        → true só se for esse mesmo
--   jogador sem dono      → vira seu, e is_guest = false
```

Ela usa `auth.uid()`, ou seja: foi feita exatamente pro caso do mobile, que é o
único lado do app que tem sessão. Não precisa de migration.

O `reasonable.md` §9b conta por que ela nasceu, e a razão é a sua: *"alguém votou
a noite inteira como outra pessoa"*. Seu instinto de que falta amarração está
certo — e é um problema que já aconteceu de verdade aqui.

### 1.2 "mais seguro" — não pelas contas, pelas policies

Esta é a parte que não fecha. Conferi as policies no banco:

```
players, peladas, pelada_members, sessions, session_players, matches
  → SELECT, INSERT, UPDATE, DELETE  para  {anon, authenticated}
```

Todas. Sem `auth.uid()` em lugar nenhum. A `0022` trocou RLS por confiança entre
amigos **de propósito**, e isso quer dizer que hoje **estar logado não restringe
nada**: quem tem sessão pode escrever como qualquer jogador, exatamente como quem
não tem. Exigir conta de todo mundo, sozinho, muda zero na segurança — só adiciona
uma porta que não tranca nada.

Segurança de verdade é reescrever as policies pra exigir `auth.uid()`, e isso é
**outro projeto** — desfaz metade da `0022` e volta a depender de todo mundo estar
logado o tempo todo, inclusive na web. Vale fazer, mas é uma decisão separada
desta, e não deve entrar escondida dentro de "port pro mobile".

### 1.3 "mais fácil" — pra quem?

**Mais fácil, de verdade:** a conta é a única coisa que sobrevive a trocar de
celular. Hoje a identidade da web é um UUID no `localStorage` — perdeu o
aparelho, perdeu quem você é, e tem que se achar na lista de novo (e pode clicar
no nome errado). Isso é real e a conta resolve.

**Mais difícil, também de verdade,** e está escrito no próprio código:

- `src/lib/identity.ts` abre dizendo *"25 amigos numa praia, 4G ruim, link aberto
  dentro do WebView do WhatsApp — onde OAuth do Google quebra com frequência"*;
- o mesmo arquivo registra que **a F4 já tentou trocar isto por contas de verdade
  e voltou atrás na `0022`**;
- e você mesmo, na conversa que criou o `mobile/`: *"não queria ter que pedir
  email de todo mundo hoje para testar"*.

Em defesa da sua ideia: o motivo da volta atrás na F4 **não se aplica** ao que
você está propondo. A F4 caiu porque dependia do *anonymous sign-in*, um toggle
de painel que, desligado, deixou o site inteiro somente-leitura sem avisar.
E-mail e Google não têm esse modo de falha. O precedente assusta mais do que
deveria.

O que sobra de custo é frição no lugar errado: 15 pessoas criando conta às 21h,
na areia, no 4G da praia.

### 1.4 O modelo, como você descreveu

Refinado na sua palavra, que é mais precisa que a minha primeira leitura:

> todo mundo **pode** logar, ninguém **precisa**. Quem entra pela primeira vez
> chega como um nome na lista, sem conta. Quem cria conta dá *claim* num nome
> — **e só em nome que ninguém reivindicou ainda**. Na semana seguinte quem já
> logou não dá claim de novo: já é dono do próprio nome, e só volta a aparecer
> quando o organizador colar a lista com ele. O organizador gera os links pra
> quem é novo.

| quem | como entra | o que precisa |
| --- | --- | --- |
| organizador | conta, e o jogador dele **reivindicado** | obrigatório — sem isso o banco não o reconhece como admin (§1.5) |
| jogador que já logou | login; o jogador dele já tem dono | nada. A lista da semana o traz de volta pelo nome |
| jogador novo | nome na lista, e claim se/quando quiser conta | conta opcional |
| convidado | o organizador digita o nome | nada, nunca |

### 1.5 Isto já existe no banco. Inteiro.

Procurando o que faltava, achei o fluxo pronto — escrito antes da `0022`,
aposentado por ela, e nunca apagado:

```sql
-- admin_add_roster_member(pelada, nome, email?, papel?) -> (player_id, token)
--   exige is_pelada_admin()        ← o organizador gera o link
--   acha ou cria o jogador na pelada, status 'invited'
--   devolve um token em pelada_invites  ← a tabela existe, com 0 linhas

-- claim_roster_invite(token) -> (id, slug, player_id)
--   exige sessão
--   token já usado (claimed_at) -> zero linhas
--   sem jogador ainda -> reivindica, E SÓ SE user_id is null
--   JÁ tem jogador   -> move a participação pro jogador que você já é,
--                        e marca o nome-placeholder como removed
```

A última linha é exatamente o seu *"quem já logou já vai ter conta e só vai
adicionar essa pessoa no próximo round"*. E o `and user_id is null` é o seu *"só
vai poder dar claim em uma conta que não está"*. Ninguém escreveu isso pensando
no mobile — é convergência, e ela indica que o modelo é o certo.

O `claim_player(uuid)` (§1.1) continua valendo pro caso sem link: tocar no
próprio nome na lista. Os dois convivem — um é auto-serviço, o outro é
autorizado pelo organizador.

**Por que isso importa:** o claim livre tem o furo que o §9b do `reasonable.md`
documenta (*"alguém votou a noite inteira como outra pessoa"*), e agora com conta
o erro é **permanente**, não um `localStorage` que se limpa. O link do
organizador fecha o furo: o claim passa a ser autorizado por quem monta a lista.

### 1.6 O que falta pra isso rodar

Quatro coisas, e nenhuma é grande:

1. **as duas funções estão quebradas** — o mesmo `column reference "player_id"
   is ambiguous` que a `0024` consertou no `join_pelada`. As duas devolvem
   `player_id` como coluna de saída e fazem `on conflict (pelada_id, player_id)`
   no corpo. → **`0025`**, idêntica em forma à `0024`;
2. **`admin_add_roster_member` casa nome sem `unaccent_safe`** — usa só
   `lower(trim())`, ao contrário do `add_member` da `0023`. Convida "Lenin" e
   duplica o "Lênin" que já está lá. → mesma `0025`;
3. **ninguém é admin aos olhos do banco.** `is_pelada_admin()` pergunta por
   `current_player_id()`, que é `players where user_id = auth.uid()`. Hoje o dono
   da Prainha não tem conta ligada — então a função recusa **você inclusive**.
   → o primeiro claim tem que ser o seu, e é o passo zero da F1;
4. **`sync_members` derruba convite pendente.** Ele marca `removed` tudo que não
   está na lista colada e não é `owner`/`admin` — e `invited` entra nessa. Quem
   foi convidado mas ainda não clicou some na próxima colação. → poupar
   `invited` na `0025`, ou aceitar de propósito e dizer isso na tela. **Palpite:**
   poupar: o convite é do organizador, não da lista.

Note que isto **não é o projeto de RLS do §1.2.** Continua tudo `anon,
authenticated`; a única coisa que o login passa a garantir é *quem é você*, não
*o que você pode*. É um degrau real, e só um.

## 2. O vocabulário — a armadilha pra quem ler os dois

| na tela do mobile | na tela da web | no banco |
| --- | --- | --- |
| **grupo** | pelada | `peladas` |
| **pelada** (a noite) | pelada de hoje / sessão | `sessions` |

O mobile usa `grupo/[id]` porque você pediu assim (*"diferenciar pelada e grupo é
massa"*), e você estava certo — é mais claro que o da web. Mas quem abre os dois
repositórios lê a mesma palavra com dois sentidos.

**Decisão: o mobile mantém `grupo`/`pelada` e a web fica como está.** Renomear a
web é mexer em `peladas` no banco, em `/p/[slug]` e em 25 componentes, por um
ganho de vocabulário. Mas entra uma seção no `reasonable.md` com esta tabela, que
custa cinco linhas e economiza a próxima meia hora de confusão.

---

## 3. As fases

Você marcou os quatro blocos. A ordem abaixo é por **o que quebra na praia**
primeiro — não por tamanho.

### F0 — um `db.ts` só ⏱ ~1h
`shared/` na raiz com os seis arquivos, os dois apps importando de lá, `vitest`
rodando em cima do compartilhado. Sem isto, tudo abaixo vira dívida no dia
seguinte.

### F1 — mexer ao vivo + organizador + identidade ⏱ ~7h
O que salva a noite quando algo sai errado, que é sempre.

- **`PlayerSheet`** — tocar num jogador: mover pra outra quadra (`movePlayer`),
  trocar com alguém (`swapPlayer`), tirar da noite (`leaveSession`), botar de
  volta (`rejoinSession`);
- **`swapSides`** na quadra, que é o "trocou de lado no meio do set";
- **organizador**: `resetScore` (placar errado), `reopenSession` (encerrou sem
  querer), `resetSession` (recomeçar a noite) — os três atrás de confirmação,
  §12 do `reasonable.md`;
- **identidade** (§1.4–1.6), e ela começa por você: ligar a sua conta ao jogador
  dono da Prainha, senão `is_pelada_admin()` recusa e nada de convite funciona.
  Depois: tocar no próprio nome → `claim_player`, e a tela de convite do
  organizador → `admin_add_roster_member` + deep link
  `voleidagalera://convite/<token>` → `claim_roster_invite`.

### F2 — a lista da semana inteira ⏱ ~3h
O mobile só tem `addMember`, um nome por vez. Falta o que o v3 fez na web: colar
o bloco do WhatsApp, a prévia *entram / ficam / saem*, `gravar`. O parser
(`roster-parse.ts`) já está pronto e testado, e depois da F0 é o mesmo arquivo —
é só tela. Porta direta do `ListaDaSemana.tsx`.

### F3 — destaques / voto ⏱ ~6h
O maior. Sete funções e a tela mais complexa da web (`Highlights.tsx`, 14,2K):
abrir o voto, votar, **reler o próprio voto** (`myVotes` — e a `0019` existe só
por isso), fechar, ver quem votou e quem falta. Empate na última vaga entra
junto, que foi decisão consciente (commit `5d97b25`).

### F4 — estatísticas + histórico ⏱ ~3h
`fetchPlayerStats`, `fetchHeadToHead`, `fetchDayMatches`. É o que se olha no
sábado de manhã, não na praia — por isso por último, apesar de ser o mais fácil.

**Ordem de corte:** F4 e F3, nessa ordem. F0→F2 é o mínimo pro app substituir a
web numa sexta.

---

## 4. O que NÃO transpor

- **imagem OG / `ShareCard` / `/api/og`.** Existe pra quando o link cai no grupo
  do WhatsApp e precisa de uma prévia bonita. App nativo não tem link. O que faz
  sentido no lugar é o `Share` do sistema mandando o link da **web** — e isso o
  `gestao.tsx` já faz;
- **rotas por `slug`** (`fetchPeladaBySlug`, `playerExists`). O mobile navega por
  `id` e não tem URL pra ser bonita. São as duas únicas das 23 funções que ficam
  paradas de propósito;
- **`AccountSheet` com três portas** (§15b). Ela tinha três entradas porque a web
  é um link que cai no meio da noite. O app tem uma tela de abertura — uma porta
  basta;
- **web e mobile com a mesma cara.** O `mobile/components/ui.tsx` já tem a
  linguagem visual dele (290 linhas). Copiar o CSS da web pro RN é retrabalho com
  resultado pior.

---

## 5. Riscos

| risco | o que acontece | mitigação |
| --- | --- | --- |
| F0 adiada "pra depois das telas" | Duas cópias divergem, e aí unificar vira merge manual de 47K | É a F0 por isto. Uma hora agora, dias depois |
| `claim_player` reivindica o nome errado | Alguém fica dono do jogador de outro, e agora com conta — é mais difícil de desfazer que o localStorage | A tela pergunta e confirma. E só oferece nomes **sem dono** |
| Conta obrigatória na praia | 15 cadastros no 4G às 21h, OAuth quebrando no WebView | §1.4: opcional pra jogar. Se for obrigatória, testar o cadastro completo num 4G ruim **antes** da sexta |
| Sem teste no mobile | O port quebra a lógica e ninguém vê | Depois da F0 os 81 testes cobrem os dois. Tela continua sem teste, e tudo bem |
| `sessions` aberta em dois lugares | Web e app abrindo a noite ao mesmo tempo | `ensureTodaySession` já é idempotente. Vale conferir com os dois abertos |

---

## 6. Perguntas em aberto

1. **A web continua existindo depois disto?** Se o app vira o caminho principal,
   a web pode virar só o link de leitura que cai no grupo (placar ao vivo, sem
   escrever) — e aí metade das telas dela para de precisar de manutenção.
   **Palpite:** sim, continua, como leitura pública. Mas é decisão sua e muda o
   que vale manter dos dois lados.
2. **Android e iOS de verdade, ou Expo Go?** Hoje roda no Expo Go, e o deep link
   do e-mail não funciona lá (`exp://`). Pra 15 pessoas instalarem, precisa de
   build — EAS, TestFlight, APK. **Palpite:** não entra neste PRP, mas é o que
   separa "testei no meu celular" de "o grupo usa".
3. **Convite: link ou código?** O `pelada_invites.token` é hex de 18 bytes —
   bom pra link, impossível de ditar em voz alta na praia. Um código curto por
   pessoa seria digitável, mas adivinhável. **Palpite:** link, compartilhado pelo
   `Share` do sistema direto no WhatsApp, que é onde a lista já vive.

## 7. Definição de pronto

- `npx tsc --noEmit` limpo nos **dois** projetos, e `npx vitest run` verde em cima
  do `shared/` — não de uma cópia;
- nenhuma das 23 funções da tabela sem chamada no `mobile/`, tirando as duas do §4;
- uma sexta inteira conduzida **pelo celular**, sem abrir a web: lista → noite →
  check-in → times → placar → alguém chega tarde e entra → destaques → encerrar;
- `reasonable.md` com a tabela de vocabulário (§2) e uma seção sobre onde a
  identidade mora depois da §1.4;
- `mobile/README.md` dizendo o que o app faz hoje, já que ele passa a ser o
  caminho principal.
