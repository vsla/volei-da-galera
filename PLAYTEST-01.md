# Playtest 01 — Prainha ZN

Primeira pelada rodada com o site no lugar do bot. ~25 pessoas, 1 quadra, 6×6.

**Veredito.** Funcionou. "Gostaram muito, ajudou a organizar os times, aceitaram
legal." O que o `RESUMO.md` apostou — que o diferencial é a tela ao vivo e não o
algoritmo — se confirmou. O que quebrou foi quase tudo periférico: placar preso
num celular só, contagem de espera mentindo, e a letra do time (A/B) trocando de
lado no meio da noite.

Este arquivo é o **registro cru** do playtest: o que aconteceu, a causa no
código, e a decisão. O plano de como consertar está no [`PRP-V2.md`](./PRP-V2.md).

---

## 1. O que deu certo

- **Check-in próprio + fila ao vivo.** Ninguém pediu pro organizador "me põe na
  lista". Era o risco nº 2 do `RESUMO.md` (adoção) e não se materializou.
- **Aceitação da rotação.** "Vencedor fica, cai no teto" foi aceita. A galera
  entendeu que sair depois de ganhar não é bug.
- **Ficar 3 rodadas fora.** Acharam estranho, mas entenderam que é consequência
  da fila. Não é bug — é UX de expectativa (ver §11).

## 2. Placar preso num celular só

**Sintoma.** Quem marcava ponto era o único que via o placar. Outro celular
abrindo a mesma partida via 0×0.

**Causa.** `Scoreboard.tsx` guarda o placar em `localStorage`
(`placar:<matchId>`). Só chega ao banco no `finishMatch`, como `score_a/score_b`.

**Decisão.** Placar vira **estado do banco, ao vivo**, como o resto. Incremento
atômico via RPC (dois marcadores ao mesmo tempo não podem se sobrescrever), com
otimista local pro toque não esperar a rede. `localStorage` continua como
fallback offline, não como fonte da verdade.

→ `PRP-V2` F1

## 3. "Fora N" mostrando menos do que a pessoa esperou

**Sintoma.** Quem estava de fora há 2 rodadas via "fora 1". "Talvez não conta o
jogo atual como fora também."

**Causa.** `rounds_waiting` só anda no **registro** da partida
(`rotation.ts:79`) — de propósito, pra quem foi sorteado e substituído não perder
a vez. Só que a tela mostra o número do banco cru: enquanto a partida corre,
quem está fora dela ainda não teve o `+1` contabilizado.

**Decisão.** A regra do banco fica como está (ela protege a fila). Muda a
**exibição**: a fila mostra `rounds_waiting + 1` para quem está fora com partida
ativa rolando. Esconder `fora 0` está correto e continua.

→ `PRP-V2` F0

## 4. Os próximos 6 não aparecem todos

**Sintoma.** "Deveria mostrar os próximos em tempo real, quem vai ser próximo no
jogo, um indicativo no nome — tem, mas não mostra todos os 6."

**Causa.** Duas:
1. `Queue.tsx` colapsa em 6 linhas (`COLLAPSED = 6`). Quem tem `▶` e está na
   7ª posição não aparece sem expandir.
2. `nextUpIds` (`Lobby.tsx:155`) roda `generateNextMatch` com o `championIds`
   da partida **anterior** — durante uma partida ativa esse campeão está
   desatualizado, então a prévia pode marcar gente errada.

**Decisão.** Bloco fixo **"ENTRAM NA PRÓXIMA"** acima da fila, sempre com os 6,
sempre visível, sem depender de expandir. É correto mostrar 6 da fila em
qualquer cenário: a rotação garante que **sempre exatamente `teamSize`
rotacionam por partida** (`reasonable.md` §8) — ganhando ou perdendo o campeão,
entram 6 de fora. Quem exatamente, entre empatados em jogos, pode mudar pelo
desempate de equilíbrio, então o rótulo é "prováveis" e a lista se atualiza ao
vivo.

Isso também era o pedido de agilidade: "tem que mostrar os próximos antes de
acabar, pra dar mais agilidade".

→ `PRP-V2` F0

## 5. O lado do time trocando (A ↔ B)

**Sintoma.** O maior atrito da noite. "O lado de quem ganhava sempre mudava pra
B ou pra A — todo time que ficava na quadra ia pro A." Nas primeiras rodadas
botaram placar no time errado e o time errado venceu.

**Causa.** É invariante de projeto, não acidente: `rotation.ts:18` — *"quem fica
na quadra é sempre o time A da partida seguinte"*. Simplifica o gerador e a
rotação. Só que na areia o time **não troca de lado físico** — quem ficou
continua no mesmo lado da rede, mas a tela renomeia ele de B pra A.

**Decisão.** Duas mudanças:
1. **Identidade do time deixa de ser A/B.** Vira **cor/lado fixo** (ex.
   `LIMA` e `AZUL`, configurável por pelada), amarrado ao lado físico da quadra.
   Quem fica, fica com a mesma cor.
2. **Botão "trocar lados"** do organizador, pra quando a galera trocar de lado
   de verdade (sol, vento, meio de set).

Internamente `team A/B` continua existindo no banco — o que muda é que a partida
passa a guardar qual time está em qual lado, e o gerador respeita o lado de quem
segurou a quadra. Os testes de rotação precisam parar de assumir "staying = A".

→ `PRP-V2` F2

## 6. Substituição no meio da partida

**Sintoma.** "Às vezes um sai e outro entra no lugar. Se ele estava no time que
ganhou e mudou lá no sistema, e o time sai, ele meio que só joga uma a mais.
Deveria não contar e continuar — daí ele sairia na próxima."

**Causa.** `swapPlayer` troca o `player_id` da linha em `match_players`. A
partir daí, para todo efeito, quem entrou **é** o titular: conta o jogo, entra
na lista de campeões, herda o direito de ficar na quadra. Quem saiu volta pra
fila intacto (isso está certo e continua).

**Decisão.** Vira **configuração da pelada**, porque os dois comportamentos são
defensáveis e o grupo vai querer decidir:

| `substitution_mode` | Quem entrou no meio |
|---|---|
| `titular` (hoje) | conta o jogo e herda a vaga na quadra |
| `tapa_buraco` (novo padrão sugerido) | **não** conta o jogo e **não** herda a vaga: se o time ficar, ele sai e o titular original volta pra vaga |

Precisa de `match_players.joined_mid` + `substituted_for` pra distinguir quem
começou de quem entrou depois — hoje essa informação é destruída pelo update.

→ `PRP-V2` F7

## 7. Não poder votar em si mesmo

**Estado.** Já está fechado em três camadas: `check (voter_id <> player_id)` na
`0001`, filtro no `castVotes` (`db.ts:510`) e a própria pessoa não aparece na
lista (`Highlights.tsx:47`).

**O que realmente aconteceu.** Identidade errada no aparelho: com o celular
"logado" como outra pessoa, você não vê **aquela** pessoa na lista e vota como
ela. O sintoma parece "dá pra votar em si mesmo". Já foi mitigado (mostrar quem
você é no header e na votação — commit `34f85f0`), e some de vez com login real.

→ `PRP-V2` F4

## 8. Quem falta votar (organizador)

**Estado.** Entregue: `highlight_voters` (`0009`) + bloco na votação.

**Falta.** Encerrar a votação sem aviso quando ainda faltam pessoas, e uma forma
de cutucar (copiar a lista de quem falta pro WhatsApp).

→ `PRP-V2` F6

## 9. Teclado do PIN no Android

**Sintoma.** "Abre o organizador, o teclado de PIN é de número, não de teclado —
bugou e não conseguiu colocar o PIN, teve que copiar e colar."

**Causa.** `OrganizerSheet.tsx:84-87`: `type="password"` + `inputMode="numeric"`
+ `autoComplete="one-time-code"`. Essa combinação faz o Android abrir o teclado
numérico e, com o gerenciador de senhas no meio, travar a digitação de um PIN
que não é só dígito.

**Decisão.** Teclado numérico **próprio na tela** (6 botões grandes + apagar),
que não depende do teclado do sistema — é o mesmo remédio do resto do app: alvos
grandes, em pé, no escuro, com areia na mão. E, com papéis de verdade (F4), o
PIN vira exceção, não a porta principal.

→ `PRP-V2` F0

## 10. Partida finalizada continua manipulável

**Sintoma (relato).** "Tá podendo ver outra partida com o jogo finalizado."

**Causa provável.** Nenhuma tela trava ação sobre partida `finished`; o
`Scoreboard` fica aberto após o `finishMatch` até alguém fechar, e o
`fetchState` traz `lastMatch` que a UI ainda deixa acessível.

**Decisão.** Partida `finished` é **somente leitura** em toda a UI, e o placar
fecha sozinho ao registrar. Item a reproduzir no próximo playtest — o relato
está ambíguo.

→ `PRP-V2` F0

## 11. Ficar 3 rodadas fora

**Sintoma.** Estranharam, mas entenderam. Pedido: "ter como resetar tudo e
nivelar depois do fim de uma partida — refaz os times com quem está fora, ou
considerando o time vencedor com gente de fora."

**Decisão.** Três coisas, nenhuma mexendo na regra da fila:
1. **Teto de espera configurável** — depois de `N` rodadas fora, a pessoa entra
   obrigatoriamente na próxima (fura o desempate, nunca a contagem de jogos).
2. **"Nivelar a noite"** entre partidas: desfaz o campeão e monta os 12 do zero
   priorizando quem está fora há mais tempo. É o "⚖️ rebalancear" atual,
   disponível **entre** partidas e não só durante.
3. A fila passa a mostrar `fora N` correto (§3), que é metade da ansiedade.

→ `PRP-V2` F5

## 12. O que foi pedido além dos bugs

Da lista do playtest, o que não é conserto e sim produto novo:

- **Login e cadastro com foto**, pra foto aparecer no Destaque do Dia
- **Criar pelada** e ter **jogos de pelada** (ex: "Vôlei da Sexta") — hoje o app
  inteiro é uma pelada só, implícita, e uma sessão por data
- **Papéis**: admin, organizador, jogador, convidado
- **Painéis** de gestão da pelada
- **Placar visível em mais de um device** e **estatísticas** montáveis
  ("ganhei todas de fulano")
- **Placar na home**
- **Tudo mais configurável** por pelada

Isso é o `PRP-V2` inteiro (F3 em diante).
