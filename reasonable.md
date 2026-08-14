# reasonable.md — o que foi feito, por quê, e onde está o teste

Este arquivo existe pra que alguém que chega no projeto entenda **as decisões**,
não só o código. O código diz *o quê*; aqui está o *por quê*.

Regra de ouro deste arquivo: **toda regra de negócio listada aqui tem um teste
com nome parecido**. Se você mudar a regra e o teste não quebrar, o teste está
errado. Se mudar a regra, atualize esta linha aqui junto.

Contexto do produto: `RESUMO.md` (decisões de design) e `PRP.md` (o plano).

---

## 1. A fila: quem joga a próxima

**Regra.** Ordena por `menos jogos` → `há mais rodadas esperando` → `sorteio`.

**Por quê.** Justiça é a única coisa que a galera confere de cabeça: "eu joguei
2, ele jogou 4". Se a fila mentir, o site perde pro WhatsApp na hora.

O desempate é **sorteio, não ordem de chegada**. Chegada acumula viés: quem
chega cedo jogaria mais a noite inteira, toda sexta. Com sorteio o viés não
acumula.

| Onde | Teste |
|---|---|
| `match-generator.ts` → `orderQueue` | `"quem está fora há mais rodadas entra antes, com os mesmos jogos"` |
| | `"jogos ainda mandam mais que a espera"` |

## 2. Rodadas esperando (`roundsWaiting`)

**Regra.** `+1` em todo mundo que ficou de fora a cada partida **registrada**;
zera pra quem jogou. Quem é sorteado e substituído **antes do apito** mantém a
espera acumulada.

**Por quê.** Mede a mesma coisa que `lastPlayedAt`, mas na unidade em que a
galera reclama: "tô fora há 3 rodadas". Vem do bot do Neto
([`core.py`](https://github.com/N3tto/pelada-volei), `rodadas_esperando`).

A espera anda no **registro** e não no sorteio de propósito: quem foi sorteado e
não pôde jogar não perde a vez que já tinha acumulado.

| Onde | Teste |
|---|---|
| `rotation.ts` → `applyMatchResult` | `"a espera zera pra quem jogou e sobe pra quem ficou de fora"` |
| | `"quem não fez check-in ou foi embora não acumula espera"` |
| | `"quem foi substituído antes do fim não conta a partida nem muda de nota"` |
| `db.ts` → `finishMatch` grava a fila junto, não só a quadra | — |

## 3. Nota (`rating`) — o auto-nivelamento

**Regra.** Todo mundo começa em 5.0. Vitória `+0.5`, derrota `−0.5`, travado
entre 0 e 10. É acumulada de **todas as noites**, não do dia.

**Por quê.** É a mesma regra do bot do Neto (`AJUSTE_NOTA = 0.5`). Não precisa
ninguém dar nota pra ninguém — ela se ajusta sozinha jogando, e isso evita a
discussão que matou a ideia de nota manual ("quem foi o filho da puta que me deu
2.3?", `RESUMO.md`).

**A nota não é exposta pra galera** — só pro organizador. A fila normal mostra
jogos e rodadas de espera, que são fatos objetivos. No modo organizador ela
mostra também `#ranking · nota`, igual ao `/lista` do bot, porque quem monta os
times precisa enxergar o que o algoritmo está fazendo pra poder discordar dele.

Publicada pra todo mundo, a nota viraria ranking social de 25 amigos — é a
discussão que o `RESUMO.md` decidiu evitar.

| Onde | Teste |
|---|---|
| `rotation.ts` → `RATING_STEP` | `"vencedor sobe 0.5 e perdedor desce 0.5"` |
| | `"a nota não passa de 10 nem cai abaixo de 0"` |

## 4. Onde a nota pode e não pode mandar

Esta é a decisão mais delicada do projeto. Três camadas, em ordem de força:

1. **Quem entra** → manda a fila, sozinha. A nota **não** decide, nem um pouco.
2. **Qual dos empatados entra** → manda a nota. Entre pessoas com o mesmo
   número de jogos ninguém tem mais direito que o outro, então escolher quem
   equilibra melhor não tira a vez de ninguém.
3. **Como os 12 se dividem** → manda a nota, sem restrição. Os 12 já foram
   escolhidos; só falta decidir os lados.

| Onde | Teste |
|---|---|
| `match-generator.ts` → `BALANCE_WEIGHT` | `"equilibra os times na divisão de 12"` |
| | `"escolhe, entre os empatados, quem casa melhor com a força do campeão"` |
| | `"a nota NUNCA fura a fila"` (craque com 9 jogos não passa na frente) |

## 5. A janela de equilíbrio que a gente NÃO implementou

O bot do Neto tem uma "janela" (`PESO_JOGOS_EXTRA = 3.0`, `core.py:31`): ele
pode puxar alguém que está **um jogo à frente** na fila quando isso melhora o
equilíbrio em mais de 3 pontos de nota. Chegamos a implementar e **tiramos**.

**Por que tiramos.** A janela significa, na prática, alguém que já jogou 4
entrar no lugar de alguém que jogou 2. Justiça é a única coisa que a galera
confere de cabeça — e uma partida desequilibrada acaba em 15 minutos, enquanto
um "ele jogou mais que eu e entrou na minha frente" dura a noite toda e volta na
sexta seguinte.

**O que ficou no lugar.** O equilíbrio age onde não custa a vez de ninguém:
entre os **empatados em jogos**. Com 25 pessoas e 6×6 esse grupo é grande quase
sempre, então na prática quase toda rodada tem espaço pro equilíbrio trabalhar —
sem furar fila nenhuma.

`explanation.extraGamesUsed` continua existindo, mas agora é uma **trava viva**:
tem que ser sempre zero, e um teste varre uma noite inteira conferindo.

| Onde | Teste |
|---|---|
| `match-generator.ts` → `pickFromQueue` | `"escolhe os fortes quando eles estão EMPATADOS com os fracos"` |
| | `"NÃO alcança quem jogou mais, nem por um jogo, nem pra salvar a partida"` |
| | `"ninguém com mais jogos que o corte entra, em nenhuma rodada da noite"` |

## 6. Variedade: não repetir sempre os mesmos

**Regra.** Entre os já escolhidos, minimiza parceiro repetido nas últimas 3
rodadas (peso 30) e adversário repetido (peso 10).

**Por quê.** Justiça sozinha produz partidas certas com gente errada — os mesmos
seis se reencontram a noite toda. A variedade só opera **dentro** do que a fila
permitiu, então nunca custa a vez de ninguém.

| Onde | Teste |
|---|---|
| `match-generator.ts` → `TEAMMATE_WEIGHT`, `indexHistory` | bloco `"variedade"` |

## 7. Busca exata em vez de sorteio de candidatos

**Regra.** Quando a combinatória cabe (≤ 20.000 combinações), testa **todas**.
Acima disso, cai no sorteio de 300 candidatos + busca local.

**Por quê.** 12 pessoas em 6×6 dá 924 divisões possíveis — dá pra achar a melhor
de verdade, não a melhor de 300 sorteadas. Só passa de 20.000 em time grande
(`teamSize` 7–8), que não é o caso de vocês.

| Onde | Teste |
|---|---|
| `match-generator.ts` → `countCombos`, `combinations` | coberto pelos testes de equilíbrio |

## 8. Rotação: rei da quadra com teto

**Regra.** Vitória normal: perdedor sai, vencedor fica. Ao bater `maxStreak`
(2 por padrão) vitórias seguidas, o **vencedor é desfeito e volta pra fila**, e
**quem perdeu segura a quadra** com a série zerada.

**Por quê.** É a regra da praia, e vem do bot (`core.py:421`). O ponto dela é que
**sempre exatamente 6 rotacionam por partida**, nunca 12 — a fila anda no mesmo
passo a noite inteira e não trava esperando juntar 12 pessoas de fora.

O efeito colateral é que "quem ganhou sai" parece bug. Por isso existe a tela
`NextUpSheet`, que explica em uma frase antes da próxima partida começar.

| Onde | Teste |
|---|---|
| `rotation.ts` → `applyMatchResult` | bloco `"rotação"` |

## 9. Segurança: o que o banco protege e o que não protege

**Estado atual.** A RLS é aberta pra leitura e escrita (`0002`, `0004`). A
publishable key está no bundle, então **quem abre o DevTools consegue escrever
direto no banco**. O PIN do organizador barra na tela, não no banco.

**Por quê.** É vôlei entre amigos, e o custo de fazer certo é um route handler
com service role pra cada escrita. A escolha está registrada nos comentários das
migrations, não escondida.

O que o banco **ainda** protege, de propósito:

- `sessions` e `players` não têm `delete` — é ali que o cascade levaria a noite
  inteira (ou o cadastro de todo mundo) junto.
- `highlight_votes` não tem `select` pro anon: o voto é privado de verdade. A
  contagem sai pela função `highlight_tally`, que só devolve agregado.

**Quando isso mudar**, o caminho é mover as escritas de organizador pra route
handlers com `SUPABASE_SERVICE_ROLE_KEY`.

## 10. Rebalancear os times

**Regra.** "⚖️ Rebalancear os times", na engrenagem, refaz os **dois** times do
zero, ignorando quem está segurando a quadra (`forceReshuffle`). A fila continua
mandando em quem entra — quem jogou menos —, e a nota decide os lados.

**Por quê.** Depois de algumas rodadas os times viciam: o mesmo grupo se
reencontra, o campeão fica forte demais, e a noite trava. Isso é o botão de
"parou tudo, monta tudo de novo" — com os dois critérios juntos, justiça de
jogos e equilíbrio de força.

Note que ele **não** é o mesmo que "🎲 re-sortear esta partida", que fica colado
na quadra: aquele mantém o campeão e só troca o desafiante.

| Onde | Teste |
|---|---|
| `match-generator.ts` → `forceReshuffle` | `"resortear todo mundo ignora o campeão e monta 12 do zero"` |

## 11. Reset e desfazer o encerramento

**Regra.** Duas ações separadas, ambas atrás da engrenagem:

- **Voltar pra quadra** — desfaz o "encerrar a noite". Não apaga nada.
- **Resetar a noite** — apaga partidas, check-ins, contagem e votos do dia.
  Confirmação digitando `RESETAR`.

**Por quê.** Encerrar é um toque só e vai acontecer sem querer. Já o reset é
irreversível, então mora sozinho, longe do polegar, e exige texto — dois toques
errados no bolso não podem apagar a sexta.

**O reset não reverte a nota**, porque ela é acumulada de todas as noites e
desfazer exigiria reprocessar cada partida apagada. A tela avisa isso antes de
confirmar.

---

## Migrations, na ordem

| Arquivo | O que faz |
|---|---|
| `0001_init.sql` | schema, RLS aberta, realtime |
| `0002_rls_tighten.sql` | tira o `delete` geral, fecha o `select` dos votos, cria `highlight_tally` |
| `0003_court_state.sql` | `players.rating`, `sessions.champion_ids/streak`, `matches.champion_stays` |
| `0004_reset.sql` | devolve `delete` em `matches` e votos, pro reset funcionar |
| `0005_rounds_waiting.sql` | `session_players.rounds_waiting` |

## Como rodar os testes

```bash
npx vitest run     # 51 testes
npx tsc --noEmit   # tipos
```
