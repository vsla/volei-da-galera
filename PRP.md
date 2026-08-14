# PRP — Vôlei Prainha ZN

> **Product Requirement Prompt.** Documento executável: contém contexto,
> especificação de UI, modelo de dados, algoritmo, tarefas ordenadas e critérios
> de validação. Leia inteiro antes de escrever código.

---

## 1. Goal

Construir um web app mobile-first que organize o vôlei semanal da Prainha ZN:
check-in dos jogadores, geração justa de partidas 6x6 com rotação
"vencedor fica", ajuste manual pelo organizador e votação de Destaques do Dia.

**Estado final:** deployado na Vercel, usável por ~25 pessoas simultaneamente
pelo celular, numa praia, com 4G ruim, à noite.

## 2. Why

- Hoje a rotação é gerenciada por um bot de Telegram operado por uma pessoa só.
- O bot resolve o sorteio, mas **não resolve o estado compartilhado**: ninguém
  sabe sua posição na fila sem perguntar, e quem chega precisa avisar alguém.
- O ganho não é o algoritmo — é **cada um fazer o próprio check-in e ver a
  quadra ao vivo**.

## 3. Contexto do domínio

- Toda **sexta**, praia da Zona Norte, ~25 pessoas, **1 quadra, 6x6 na areia**.
- As pessoas **chegam em horários diferentes** ao longo da noite.
- Existe **placar físico** na quadra. Ninguém vai digitar pontos no celular.
- Toda semana tem **convidado novo** que não tem conta e talvez nunca volte.
- O grupo é de amigos. Qualquer coisa que exponha "quem é ruim" é veneno social
  e vai matar o produto.

Regra de rotação real da praia: **quem ganha fica na quadra**. Definimos um
teto de `N` vitórias seguidas (default 2) pra fila não travar quando um time
domina.

---

## 4. Stack

```
Next.js 15 (App Router) · TypeScript · Tailwind CSS
Supabase (Postgres + Realtime) — SEM Supabase Auth
Vercel · zod · dnd-kit · lucide-react
Vitest (testes do algoritmo)
next/font (Barlow Condensed + Inter, self-hosted)
```

**Autenticação:** não usar OAuth nem Supabase Auth. O usuário abre o site,
escolhe seu nome numa lista, e a escolha fica em `localStorage`. Convidado é
criado pelo nome, por qualquer pessoa. Organizador entra com um PIN
(`ORGANIZER_PIN` em env var), validado em route handler no servidor, guardado
em cookie httpOnly.

**Motivo:** 25 pessoas na praia, 4G ruim, link aberto dentro do WebView do
WhatsApp — onde OAuth do Google quebra com frequência. Login não pode custar
mais que 1 toque.

RLS aberta nas tabelas de sessão. É vôlei, não banco. Escritas sensíveis
(gerar partida, finalizar, encerrar sessão) passam por route handler que checa
o cookie de organizador.

---

## 5. Design system

Direção: **placar noturno** — transmissão esportiva, fundo escuro, números
grandes, caixa alta. Lê bem à noite na praia e poupa bateria em OLED.

### 5.1 Cores

```css
--bg          #0A0F0D   /* base, quase preto esverdeado */
--surface     #131A17   /* cards */
--surface-2   #1C2622   /* cards aninhados, linhas da fila */
--border      #2A3833
--text        #F2F5F2
--text-muted  #8A9A93

--accent      #C4F82A   /* lime — AÇÃO e "VOCÊ". nunca usar para time */
--accent-ink  #0A0F0D   /* texto sobre lime */

--team-a      #38E1FF   /* ciano */
--team-b      #FF7A5C   /* coral */

--live        #FF3B30   /* dot pulsante "ao vivo" */
```

**Regra dura de cor:** lime é reservado para *ação do usuário* e para marcar
*você*. Times nunca usam lime. Se o time A fosse lime, o usuário não
distinguiria "meu time" de "meu botão". Três matizes distintos, todos com
contraste AA sobre `--bg`.

### 5.2 Tipografia

| Uso | Fonte | Peso | Tratamento |
|---|---|---|---|
| Números, labels de time, títulos | Barlow Condensed | 700/800 | `uppercase`, `tracking-wide`, `tabular-nums` |
| Nomes de jogador, corpo | Inter | 500/600 | normal |

Tamanho mínimo de qualquer texto: **16px**. Números de destaque (contador de
pessoas, rodada, streak): 32–48px.

### 5.3 Layout e toque

- `max-width: 480px`, centralizado, mobile-first.
- Base de espaçamento 4px. Raio: 16px cards, 12px botões, `full` em pills.
- **Alvo de toque mínimo 48×48px.** Mão com areia, no escuro, em pé.
- Ações primárias no **terço inferior** da tela (alcance do polegar).
- Respeitar `env(safe-area-inset-bottom)` na barra fixa.
- Nada essencial depende de `hover`.

### 5.4 Anti-requisitos de UI

Não construir: sidebar, dashboard, tabela densa, gráfico, modal empilhado,
breadcrumb, menu hambúrguer, tela de configurações separada. Se parecer um
painel administrativo, está errado. A tela principal é **um placar ao vivo**.

---

## 6. Telas

### 6.1 `/` — Entrar

```
        🏐
   PRAINHA ZN

   QUEM É VOCÊ?

  ┌──────────────────────┐
  │ 🔍 buscar nome...    │
  └──────────────────────┘

  ┌─────────┐  ┌─────────┐
  │  MARIA  │  │  PEDRO  │
  │    MG   │  │    PA   │      ← avatar = iniciais em círculo
  └─────────┘  └─────────┘
  ┌─────────┐  ┌─────────┐
  │  NETO   │  │ EWERTON │
  └─────────┘  └─────────┘
        ... 25 nomes ...

  ┌──────────────────────┐
  │  + SOU CONVIDADO     │
  └──────────────────────┘
```

- Grid 2 colunas. Busca filtra em tempo real (25 nomes cabem em ~2 scrolls,
  mas a busca poupa tempo pra quem chega apressado).
- Clicar salva em `localStorage` e navega pra `/hoje`.
- **Se já existe identidade no `localStorage`, essa tela nem aparece** —
  redireciona direto pra `/hoje`. Trocar de pessoa: link discreto "não é você?"
  no rodapé do lobby.
- `+ SOU CONVIDADO` abre input de nome, cria `player` com `is_guest = true`.

### 6.2 `/hoje` — Lobby ao vivo *(a tela principal)*

```
┌────────────────────────────────────┐
│ 🏐 PRAINHA ZN     sex · 14 ago  ⚙️ │  ← header sticky. ⚙️ só p/ organizador
├────────────────────────────────────┤
│ ● AO VIVO    17 NA PRAIA   RODADA 4│  ← dot pulsante vermelho
├────────────────────────────────────┤
│                                    │
│ ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ TIME A            🔥 2 VITÓRIAS┃ │  ← borda esquerda ciano
│ ┃                                ┃ │
│ ┃  MARIA    PEDRO    FEFA        ┃ │
│ ┃  BACA     BIA      TALI        ┃ │
│ ┃                                ┃ │
│ ┠──────────── VS ────────────────┨ │
│ ┃ TIME B                         ┃ │  ← borda esquerda coral
│ ┃                                ┃ │
│ ┃  NETO     EWERTON  MIGUEL      ┃ │
│ ┃  LENIN    ÁLVARO   ÍTALO ◄VOCÊ ┃ │  ← seu nome em lime
│ ┃                                ┃ │
│ ┃ ┌───────────┐ ┌──────────────┐ ┃ │
│ ┃ │ A GANHOU  │ │  B GANHOU    │ ┃ │  ← só organizador
│ ┃ └───────────┘ └──────────────┘ ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│                                    │
│ PRÓXIMOS                        (?)│  ← (?) abre "por que esses 6"
│                                    │
│  1  JOÃO           0 jogos         │
│  2  ARTHUR         1 jogo          │
│  3  LENIN          1 jogo          │
│  4  VOCÊ           2 jogos    ◄    │  ← linha destacada lime
│  5  MATEUS         2 jogos         │
│  6  GUILHERME      2 jogos         │
│     ▾ mostrar todos (13)           │
│                                    │
├────────────────────────────────────┤
│ ┌────────────────────────────────┐ │  ← barra fixa inferior
│ │      ✅ EU CHEGUEI             │ │
│ └────────────────────────────────┘ │
└────────────────────────────────────┘
```

**Barra inferior muda conforme o estado do usuário:**

| Estado | Barra inferior |
|---|---|
| Não fez check-in | `✅ EU CHEGUEI` (lime, cheio) |
| Na fila | `VOCÊ É O 4º NA FILA` (surface, informativo) |
| Jogando agora | `🏐 VOCÊ ESTÁ JOGANDO` (lime, pulsando devagar) |
| Organizador, sem partida ativa | `🎲 GERAR PRÓXIMA PARTIDA` |
| Votação aberta | `⭐ VOTAR NOS DESTAQUES` |

**Estados vazios e de erro (obrigatórios):**

| Situação | Tela |
|---|---|
| Sessão não aberta | `AINDA NÃO ABRIU A LISTA DE HOJE` + organizador vê `ABRIR SESSÃO` |
| Sessão aberta, ninguém na quadra | Card vazio: `QUADRA LIVRE` + contagem de quem já chegou |
| Menos gente que `teamSize * 2` | `FALTAM 3 PRA COMEÇAR` |
| Sem conexão | Banner discreto no topo: `sem conexão — mostrando estado de 2 min atrás`. **Nunca tela em branco.** |

**Realtime:** canal do Supabase Realtime nas tabelas da sessão. Fallback de
polling a cada 5s se o canal cair. O estado nunca some da tela por falha de
rede — só fica marcado como velho.

### 6.3 Modo edição *(organizador, na mesma tela)*

O ⚙️ do header liga o modo. A tela **não navega** — ganha uma borda lime e uma
barra de ferramentas. O organizador nunca perde de vista o estado real.

```
┌────────────────────────────────────┐
│ ⚙️ MODO EDIÇÃO              SAIR   │  ← header vira lime
├════════════════════════════════════┤  ← borda lime ao redor de tudo
│  time 4 · 5 · [6]    cai em 1·[2]·3│  ← teamSize e maxStreak inline
│                                    │
│ ┏━ TIME A ━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ ⠿ MARIA          🔒            ┃ │  ← ⠿ = alça de arraste
│ ┃ ⠿ PEDRO                        ┃ │
│ ┃ ⠿ FEFA                         ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ ┏━ TIME B ━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ ⠿ NETO                         ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│ ┏━ FILA ━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│ ┃ ⠿ JOÃO                         ┃ │
│ ┃ ⠿ ARTHUR         🚫 fora       ┃ │
│ ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│                                    │
│  + ADICIONAR CONVIDADO             │
├────────────────────────────────────┤
│ ┌────────────┐  ┌────────────────┐ │
│ │ 🎲 RESORTEAR│ │  ✓ CONFIRMAR   │ │
│ └────────────┘  └────────────────┘ │
└────────────────────────────────────┘
```

- Drag & drop com **dnd-kit** entre TIME A / TIME B / FILA.
- Toque longo num jogador abre menu: `🔒 fixar` · `🚫 tirar do sorteio` ·
  `🗑 remover da sessão`.
- Jogador **fixado** permanece no lugar em qualquer re-sorteio.
- Jogador **fora do sorteio** nunca é escolhido (machucou, foi comer).
- `teamSize` e `maxStreak` editáveis ali mesmo, sem deploy.

**Regra dura:** ajuste manual do organizador **nunca** é sobrescrito
automaticamente. Se ele editou e clica em `RESORTEAR`, pedir confirmação
explícita antes de descartar as edições.

### 6.4 Sheet "Por que esses 6?"

Bottom sheet, abre pelo `(?)` ao lado de PRÓXIMOS. **Esta tela é o que faz a
galera confiar no sorteio — não é enfeite.**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
POR QUE ESSES 6

Quem jogou menos entra primeiro.

  JOÃO       0 jogos   ✓ entrou
  ARTHUR     1 jogo    ✓ entrou
  LENIN      1 jogo    ✓ entrou
  MATEUS     2 jogos   ✓ entrou
  BIA        2 jogos   ✓ entrou  ⚖️ sorteio
  TALI       2 jogos   ✓ entrou  ⚖️ sorteio
  ─────────────────────────────
  GUILHERME  2 jogos   — ficou   ⚖️ sorteio

⚖️ diferença de jogos: 1
🔄 parceiros repetidos: 0
🎲 empate em 2 jogos resolvido por sorteio
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Mostrar **um a mais que não entrou**, com o motivo. É o que responde a
"por que ele e não eu?" antes da pergunta virar discussão.

### 6.5 `/destaques` — votação

Abre quando o organizador encerra a sessão. Só quem jogou vota.

```
   ⭐ DESTAQUES DO DIA

   Escolha até 3.
   Jogada, resenha, disposição,
   evolução — o que você quiser.

  ┌─────────┐  ┌─────────┐
  │ ✓ MARIA │  │  PEDRO  │      ← selecionado = borda lime
  └─────────┘  └─────────┘
  ┌─────────┐  ┌─────────┐
  │ ✓ NETO  │  │  VOCÊ   │      ← você = esmaecido, não clicável
  └─────────┘  └─────────┘

              2 / 3

  ┌──────────────────────┐
  │       VOTAR          │
  └──────────────────────┘
```

Depois de votar: `AGUARDANDO A GALERA · 12 DE 17 VOTARAM`.

### 6.6 `/destaques/resultado`

```
   🏆 DESTAQUES DE HOJE

  ┌────────────────────┐
  │        ⭐          │
  │      MARIA         │
  └────────────────────┘
  ┌────────────────────┐
  │        ⭐          │
  │      PEDRO         │
  └────────────────────┘
  ┌────────────────────┐
  │        ⭐          │
  │     ALISSON        │
  └────────────────────┘

     Valeu, galera ❤️
       Até sexta!

  [ 📋 COPIAR PRO ZAP ]
```

**Nunca mostrar contagem de votos.** "Maria 17 · Victor 1" transforma em
competição de popularidade e humilha quem tirou 1 voto. Os três aparecem lado a
lado, sem ordem de colocação. Votos são privados: ninguém vê em quem alguém
votou.

`COPIAR PRO ZAP` monta um texto pronto no clipboard.

### 6.7 Micro-interações

| Ação | Feedback |
|---|---|
| `EU CHEGUEI` | Confete curto + `navigator.vibrate(30)` |
| Gerar partida | Embaralhar nomes por ~600ms antes de fixar |
| Time vence | Contador de streak pulsa |
| Time cai em N vitórias | Card desliza pra fora, `CAIU! 🔻` |
| Arrastar jogador | Haptic curto ao soltar na zona |

Tudo isso respeita `prefers-reduced-motion`.

---

## 7. Modelo de dados

```sql
players
  id, name, avatar_url, is_guest, created_at

sessions
  id, date, status (open|playing|voting|closed),
  team_size default 6, max_streak default 2, created_at

session_players
  session_id, player_id,
  checked_in_at, games_played, last_played_at, excluded bool
  PRIMARY KEY (session_id, player_id)

matches
  id, session_id, round, status (active|finished),
  winner_team (A|B|null), champion_streak,
  created_at, finished_at

match_players
  match_id, player_id, team (A|B), locked bool

highlight_votes
  id, session_id, voter_id, player_id, created_at
  UNIQUE (session_id, voter_id, player_id)
  CHECK (voter_id <> player_id)
```

`games_played` é derivável de `match_players`, mas guardar denormalizado deixa
a ordenação da fila trivial. Recalcular ao finalizar cada partida.

---

## 8. Algoritmo

Função **pura**, em `src/lib/match-generator.ts`, testável sem UI e sem banco.

```ts
export function generateNextMatch(input: {
  players: SessionPlayer[]      // com check-in, games_played, last_played_at
  teamSize: number              // 6
  champion: { playerIds: string[]; streak: number } | null
  maxStreak: number             // 2
  history: PastMatch[]          // últimas rodadas
  locked: string[]              // fixados pelo organizador
  excluded: string[]            // fora do sorteio
  seed: string                  // reprodutível
}): {
  teamA: Player[]
  teamB: Player[]
  bench: Player[]
  explanation: {
    minGames: number
    maxGames: number
    gamesDiff: number
    repeatedTeammatePairs: number
    repeatedOpponentPairs: number
    picked: { player: Player; games: number; byTiebreak: boolean }[]
    firstOut: { player: Player; games: number; byTiebreak: boolean } | null
  }
}
```

### 8.1 Rotação

```
sem campeão (início, ou campeão caiu)
  → escolhe 12 da fila, divide em A e B

campeão com streak < maxStreak
  → campeão fica como time A
  → escolhe 6 desafiantes da fila → time B

campeão vence e streak == maxStreak
  → time inteiro volta pra fila
  → próxima rodada escolhe 12 novos
```

O perdedor volta pra fila e cai naturalmente pro fim, porque acabou de somar
+1 jogo. Sem regra especial.

### 8.2 Quem joga — fila determinística

Entre quem fez check-in, não está na quadra e não está excluído, ordenar por:

```
1. games_played     ASC   (jogou menos, joga antes)
2. last_played_at   ASC   (nulls first: nunca jogou vem antes)
3. random(seed)           (empate real → sorteio)
```

Pegar os 6 (ou 12) primeiros. **Sem pesos mágicos, sem função de custo.**
Essa lista literal aparece na tela e qualquer um confere.

**Por que o desempate é aleatório e não por ordem de chegada:** com 25 pessoas
e 6x6, empate em `games_played` é o caso comum, não a exceção. Desempatar por
chegada faria quem chega cedo jogar consistentemente mais a noite inteira — um
viés silencioso e cumulativo. Com sorteio, o viés não acumula.

O `seed` é fixo por rodada (`session_id + round`), então reabrir a tela não
embaralha a fila mostrada. Só `RESORTEAR` gera seed novo.

### 8.3 Com quem joga — otimização

Só quando há 12 pra dividir em dois times. Testar ~300 divisões A/B aleatórias
e ficar com a de menor custo:

```
cost = paresDeParceirosRepetidosNasUltimas3Rodadas * 30
     + paresDeAdversariosRepetidosNasUltimas3Rodadas * 10
```

Depois, alguns swaps locais. Para 12 pessoas roda em milissegundos.

Quando é só o desafiante (6), a fila já definiu quem entra — não há o que
otimizar.

### 8.4 Simulador

Script `npm run simulate`: roda 20 rodadas com 25 jogadores e imprime a
distribuição de jogos. É como se prova pra galera que é justo — e é exatamente
o que o bot atual já fez.

---

## 9. Tarefas, em ordem

| # | Entrega | Pronto quando |
|---|---|---|
| 1 | Scaffold + design tokens + schema + seed + deploy | URL da Vercel abre com o header e as cores certas |
| 2 | Login por lista de nomes + check-in | Duas pessoas em celulares diferentes se veem na lista |
| 3 | Lobby ao vivo com realtime | Check-in num aparelho aparece no outro em <2s |
| 4 | `generateNextMatch` + testes + sheet "por que esses 6" | Suíte de testes passa |
| 5 | Fim de partida + rotação do campeão | 5 rodadas seguidas sem intervenção manual |
| 6 | Modo edição / drag & drop | Arrastar entre times persiste e sobrevive a reload |
| 7 | Destaques do Dia + resultado | Votação fecha e mostra 3 nomes sem contagem |

**Do 1 ao 5 já substitui o bot.** Se o tempo apertar, cortar do 7 pra trás.

## 10. Seed

25 jogadores reais: Miguel, Vinícius Lamarck, Amanda Lavs, Arthur Farias,
Maria Gabrielly, Suzana Rodrigues, Pedro Augusto, Brenda Dias, Ewerton,
Lenin Pastichi, Álvaro Gabriel, Ítalo Thiago, Leandro, João Victor, Mateus,
Guilherme, Victor, João, Alisson, Brenno, Neto, Fefa, Baca, Bia, Tali.

Cenário de teste: 17 com check-in, partida ativa com campeão em streak 1,
alguns com 0 jogos, alguns com 2–4, histórico com parceiros repetidos.

## 11. Validation loop

```bash
npm run lint        # sem erros
npm run typecheck   # sem erros
npm run test        # suíte do gerador passa
npm run build       # build de produção passa
npm run simulate    # maxGames - minGames <= 2 em 20 rodadas
```

### Testes obrigatórios do gerador (seed fixo)

- nunca escolhe quem não fez check-in
- nunca escolhe quem está excluído
- tamanho dos times é sempre `teamSize`
- campeão com `streak < maxStreak` permanece na quadra
- campeão com `streak == maxStreak` sai e a rodada escolhe 12 novos
- quem tem menos jogos sempre entra antes de quem tem mais
- quem nunca jogou tem prioridade máxima
- quem chega tarde sobe pro topo da fila
- jogador fixado permanece após re-sorteio
- parceiros repetidos são minimizados na divisão 12 → A/B
- mesmo seed produz o mesmo resultado; seed diferente produz resultado diferente
- 20 rodadas com 25 jogadores: `maxGames - minGames <= 2`

### Checklist manual antes de usar na praia

- [ ] Abre no Safari iOS e Chrome Android **dentro do WebView do WhatsApp**
- [ ] Todos os alvos de toque ≥ 48px
- [ ] Legível no escuro, com brilho no mínimo
- [ ] Com a rede desligada, mostra estado velho — não tela branca
- [ ] Reconecta sozinho quando a rede volta
- [ ] Ações principais alcançáveis com o polegar de uma mão

## 12. Env vars

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # só server-side
ORGANIZER_PIN                 # PIN do organizador
```

## 13. Não construir

chat · pagamento · assinatura · ELO · nota de habilidade · placar em pontos ·
feed social · notificação push · sistema de amizade · múltiplos eventos ·
múltiplas quadras · estatísticas históricas · perfil de jogador ·
tela de configurações separada · modo desktop dedicado

## 14. Princípios, em caso de dúvida

1. **Justiça nunca é sacrificada por variedade.** A fila manda; a otimização só
   opera dentro do que a fila permite.
2. **O algoritmo tem que ser explicável em uma frase.** Se precisar de dois
   parágrafos, simplificar.
3. **O organizador sempre tem a palavra final**, e o sistema nunca desfaz o que
   ele fez à mão.
4. **Nada que exponha quem joga mal.**
5. **1 toque para as ações principais.** Praia, escuro, areia, uma mão.
