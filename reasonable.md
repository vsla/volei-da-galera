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

**A tela conta a partida em andamento; o banco não.** No playtest 01 quem estava
fora há 2 rodadas via "fora 1" e jurou que a fila mentia — porque o `+1` da
partida que está rolando só é gravado no registro. A regra do banco continua
igual (é ela que protege quem foi substituído); o que mudou é que a fila **exibe**
`rounds_waiting + 1` enquanto existe partida ativa (`Lobby.tsx` → `queueView`).

| Onde | Teste |
|---|---|
| `rotation.ts` → `applyMatchResult` | `"a espera zera pra quem jogou e sobe pra quem ficou de fora"` |
| | `"quem não fez check-in ou foi embora não acumula espera"` |
| | `"quem foi substituído antes do fim não conta a partida nem muda de nota"` |
| `db.ts` → `finishMatch` grava a fila junto, não só a quadra | — |

## 3. Nota (`rating`) — o auto-nivelamento

**Regra.** Todo mundo começa em 5.0. Vitória `+0.5`, derrota `−0.5`, travado
entre 0 e 10. É acumulada de **todas as noites**, não do dia — e é **por
pelada** (`pelada_members.rating`, migration 0012), não por pessoa: sua nota no
vôlei da sexta não diz nada sobre o vôlei de domingo, e juntas elas se
contaminariam.

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

**O lado não muda (mudou no playtest 01).** Antes valia a invariante "quem fica
vira o time A". Era cômodo pro gerador e péssimo na quadra: o time não troca de
lado da rede, mas a tela renomeava ele a cada partida — marcaram ponto no time
errado e o time errado venceu. Agora `champion.team` diz em que lado o grupo
está, o desafiante entra no lado oposto, e trocar de lado é uma **ação** do
organizador (`swap_sides`, migration 0011), nunca consequência de ter ganhado.
Os times também deixaram de se chamar "A" e "B" na tela: viram cor/nome
configurável (`teams.ts`, `settings.teamLabels`), porque ninguém confere "A"
olhando pra quadra e todo mundo confere "azul".

| Onde | Teste |
|---|---|
| `rotation.ts` → `applyMatchResult` | bloco `"rotação"` |
| | `"quem fica mantém o lado — ganhar não renomeia o time"` |
| `match-generator.ts` → `holderTeam` | bloco `"lado da quadra no gerador"` |

## 9. Segurança: o que o banco protege e o que não protege

**Antes (v1).** A RLS era aberta pra leitura e escrita, e o PIN barrava só na
tela. Era uma escolha consciente: uma pelada de amigos, e o custo de fazer certo
seria um route handler com service role por escrita.

**Agora (migration 0014).** Com peladas de grupos que não se conhecem, "quem
abre o DevTools escreve no banco" deixou de ser aceitável. A RLS passou a valer
de verdade:

- **leitura aberta** — a tela ao vivo carrega antes de qualquer sessão existir, e
  nada ali é segredo (nome, fila e placar já são públicos na quadra);
- **escrita exige `auth.uid()`** e passa por `is_member` / `is_pelada_admin`;
- **voto continua privado**: `highlight_votes` só deixa você ler o SEU voto. A
  contagem sai por `highlight_tally` / `highlight_voters` / `highlight_days_pelada`,
  todas agregadas.

**O convidado não perdeu o toque único.** Ele ganha uma sessão **anônima** do
Supabase no primeiro carregamento (`auth.ts` → `ensureSession`), e entra pela
`join_as_guest` (0013), que cria o jogador e a filiação de uma vez — separado em
dois inserts, a própria RLS barraria o segundo.

**Regra que a 0014 impôs sem a gente perceber na hora:** *escrita que depende de
outra escrita tem que morar numa função do banco.* Criar pelada e entrar por
código quebravam por isso (`0017`) — o cliente criava a pelada e só depois
tentava virar dono dela, com um id de localStorage que não era
`current_player_id()`. O sintoma foi literal: `new row violates row-level
security policy for table "peladas"`.

Daí duas consequências permanentes no código:

- **`create_pelada` / `join_pelada` / `join_as_guest` são RPC**, e o slug e o
  código de entrada são gerados **no banco** — havia uma segunda implementação
  no cliente, que foi apagada (duas versões da mesma regra é armadilha);
- **nenhuma escrita ignora o `error`.** Antes da RLS nada era recusado, então
  engolir o retorno era inofensivo; agora um check-in que falha calado é o pior
  defeito possível — a pessoa se acha na fila, o organizador não a vê, e a noite
  começa com briga. `Lobby.run` mostra a mensagem em vez de derrubar a tela, e a
  mensagem da RLS é traduzida pra ação ("habilite Anonymous sign-ins…").

⚠️ **Habilite "Anonymous sign-ins" no painel do Supabase antes de aplicar a
0014.** Sem isso, ninguém sem conta consegue fazer check-in.

⚠️ **Depois de aplicar, confira a tela ao vivo com dois aparelhos.** Realtime
respeita RLS: policy errada não dá erro visível — a tela só para de atualizar,
que é o pior sintoma possível.

## 9b. Clicar no próprio nome agora AMARRA o aparelho

**Regra.** Escolher seu nome chama `claim_player` (0013): se aquele jogador não
tem dono, ele passa a ser seu. Se já tem, a tela avisa que ali você só
acompanha.

**Por quê.** No v1 "qualquer um clica no nome de qualquer um" era aceitável — e
custou caro: alguém votou a noite inteira como outra pessoa. Com a RLS, escrever
exige **ser** aquele jogador, então o conserto de UX e o de segurança viraram o
mesmo conserto.

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

## 11. Placar (opcional)

**Regra.** "🔢 abrir placar" abre uma tela cheia com dois lados, `+`/`−` e o
número gigante, mais um cronômetro desde o início da partida. "Finalizar"
registra o vencedor **e** o placar. Empate não fecha — a rotação precisa saber
quem fica na quadra.

**Por quê ele é opcional.** O `RESUMO.md` decidiu "1 toque, sem placar", e a
decisão continua valendo pro caminho normal: no meio do jogo, à noite, com a mão
com areia, ninguém digita ponto — e uma partida não registrada trava a fila
inteira, que é bem pior que não ter o placar. Então "A ganhou / B ganhou"
continua sendo o caminho curto, e o placar existe pra outra situação: alguém
sentado fora da quadra marcando ponto a ponto.

Por isso `matches.score_a/score_b` são **NULL-áveis de propósito**: partida sem
placar é normal, não é dado faltando.

**O placar mora no banco (mudou no playtest 01).** Antes ele vivia no
`localStorage` de um celular só: quem marcava era o único que via, e qualquer
outro aparelho abria 0×0. Agora:

- o ponto é somado **dentro do banco** (`bump_score`, migration 0010) — dois
  marcadores ao mesmo tempo somam dois pontos, em vez de um sobrescrever o
  outro;
- o toque é otimista (o número sobe antes da rede responder) e, se a rede cair,
  o delta fica pendente e é reenviado sozinho;
- todo mundo vê: o placar aparece na quadra da home, e quem não marca pode abrir
  a tela do placar em modo leitura;
- trocar de lado leva o placar junto (`swap_sides`, 0011).

| Onde | Teste |
|---|---|
| `Scoreboard.tsx`, `db.ts` → `finishMatch(state, winner, score?)` | — (UI) |

## 12. Confirmação nas ações críticas

**Regra.** Ação que desfaz trabalho já feito passa por um `ConfirmSheet`:
finalizar partida (pelo card ou pelo placar), re-sortear a partida, rebalancear
os times, encerrar a noite. O reset da noite é mais duro ainda: exige digitar
`RESETAR`.

**Por quê.** A tela é operada em pé, no escuro, com o celular na mão e areia em
tudo — encostar sem querer é o caso normal, não a exceção. E o custo é
assimétrico: um toque a mais custa meio segundo, enquanto finalizar a partida
errada conta jogo pra 12 pessoas, mexe na nota de todo mundo e embaralha a fila.

O texto do botão diz **o que vai acontecer** ("Time A venceu"), nunca "OK" — a
confirmação só protege se você conseguir ler o que está confirmando. E o corpo
lista os nomes do time, pra dar pra conferir antes.

O que **não** tem confirmação, de propósito: check-in, "voltar pra quadra"
(não apaga nada) e "Começar esta partida" (você acabou de ver a prévia).

| Onde | Teste |
|---|---|
| `ConfirmSheet.tsx`, `Lobby.tsx` → `askFinish` | — (UI) |

## 13. Histórico (o menu ☰)

**Regra.** O ☰ no header abre o histórico, **pra todo mundo**, com duas abas:

- **Hoje** — todas as partidas encerradas da noite: times, quem ganhou, placar
  quando existe, e a hora. Some quando o organizador reseta a noite.
- **Outras peladas** — os três Destaques de cada sexta anterior.

**Por quê é aberto.** É leitura pura, não muda estado nenhum. E ter que
perguntar pro organizador "quem ganhou a terceira?" é exatamente o tipo de coisa
que o site existe pra eliminar.

**Por que fica fora do `fetchState`.** O estado ao vivo é relido a cada
atualização e não pode crescer com a noite; o histórico é buscado só quando
alguém abre o menu (`fetchDayMatches`).

**Os Destaques passam por função agregada.** A `0002` fechou o `select` em
`highlight_votes` — com isso, a leitura direta que o `highlights-server.ts`
fazia passou a devolver vazio (a página `/destaques` estava quebrada e ninguém
tinha notado). Agora quem responde é a `highlight_days` (migration `0008`),
`security definer`, que só devolve **nome e contagem do jogador** — nunca
`voter_id`, nunca contagem por votante.

| Onde | Teste |
|---|---|
| `HistorySheet.tsx`, `db.ts` → `fetchDayMatches`, `fetchHighlightDays` | — (UI) |

## 14. Reset e desfazer o encerramento

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

## 15. Peladas (o v2)

**Regra.** A pelada é a entidade: "Vôlei da Sexta" tem membros, configuração e
N sessões (uma por noite). A URL é `/p/<slug>`; a raiz manda pra última pelada
aberta, então quem joga numa só continua abrindo a quadra direto.

**Por quê.** Todo pedido do playtest 01 (criar pelada, papéis, painéis,
estatísticas) esbarrava na suposição de que existia uma pelada só, implícita.

**O que mudou de lugar:** a nota (§3), o "quem é organizador" (agora por pelada)
e os Destaques (`highlight_days_pelada`, 0015 — antes varriam o banco inteiro).

**A noite nasce sozinha.** Não tem cron nem SQL na mão: o primeiro que abre a
pelada no dia cria a sessão (`ensureTodaySession`). Se depender de alguém
lembrar de "abrir a noite", uma sexta começa sem lista.

| Onde | Teste |
|---|---|
| `db.ts` → `fetchState(peladaId)`, `createPelada` | `scripts/smoke.ts` (pelada descartável) |

## 15b. Onde a conta mora (e por que em três lugares)

**Regra.** O `AccountSheet` — entrar com e-mail ou Google, pôr foto, juntar o
histórico — abre de **três** lugares:

1. **home** (`/`), no botão "entrar / criar conta";
2. **"quem é você?"**, em "já tenho conta — entrar";
3. **lobby**, tocando no seu próprio nome no header.

**Por quê três.** Ela nasceu só no (3), e ficou inalcançável na prática: pra
chegar lá você já precisava estar dentro de uma pelada e já ter escolhido um
nome — quem abria o site pela primeira vez não tinha como se cadastrar, e quem
trocava de celular era obrigado a se achar na lista de novo (e podia clicar no
nome errado). Cada porta atende um momento diferente: (1) antes de qualquer
pelada, (2) aparelho novo/mesma pessoa, (3) no meio da noite.

**Entrar na conta traz o seu jogador.** Se o aparelho ainda não sabe de ninguém,
adota direto o jogador da conta; se sabe de OUTRA pessoa, não mexe — oferece
"usar meu histórico aqui". Roubar a identidade de quem emprestou o celular seria
pior que um toque a mais.

⚠️ O login com Google exige o provider configurado no painel do Supabase
(Authentication → Providers → Google, com client id/secret e a URL de redirect
do site). O magic link por e-mail funciona sem isso.

## 16. Papéis

`owner` → `admin` → `player` → `guest`. Quem monta partida e mexe na noite é
admin; check-in e voto são de qualquer um; o PIN continua existindo como atalho
de "virar organizador neste aparelho" (agora **por pelada**), e
`settings.whoCanManage: "everyone"` libera tudo pra pelada pequena que não quer
burocracia.

## 17. Configuração (`settings.ts`)

Mora em `jsonb`, com herança **padrão → pelada → sessão**. Regra nova não vira
migration, e "hoje veio pouca gente, joga 4×4" não muda a regra de toda sexta.
Campo desconhecido é ignorado e campo faltando cai no padrão: `settings` escrito
por outra versão do app nunca derruba a tela.

## 18. Teto de espera (`waitCap`)

**Regra.** Depois de `N` rodadas fora, a pessoa entra na próxima — **furando o
desempate, nunca a contagem de jogos**. Desligado por padrão.

**Por quê.** Playtest 01: "acharam meio estranho alguns ficarem 3 rodadas fora".
O teto age dentro do grupo empatado em jogos, que é onde ninguém perde a vez —
mesmo lugar em que o equilíbrio já agia (§4). Se furasse a contagem, seria a
janela que o §5 tirou de propósito.

| Onde | Teste |
|---|---|
| `match-generator.ts` → `pickFromQueue` | bloco `"teto de espera"` |
| | `"o teto NÃO fura a contagem de jogos"` |

## 19. Substituição (`substitutionMode`)

**Regra.** Duas, configuráveis:

- `titular` (o comportamento do v1) — quem entra conta o jogo e herda a vaga na
  quadra;
- `tapa_buraco` — quem entra **não** conta o jogo nem muda de nota, mas
  **continua em quadra**; quem saiu leva a partida que jogou.

**Por quê.** Playtest 01 §6: *"se ele estava no time que ganhou e mudou lá no
sistema, ele meio que só joga uma a mais — deveria não contar e continuar"*.
Precisou da 0016: a troca antiga (`update player_id`) apagava o fato de que
alguém entrou no meio, e sem esse fato não existe regra a aplicar.

| Onde | Teste |
|---|---|
| `rotation.ts` → `notCounted`, `alsoPlayed` | `"tapa-buraco: quem entrou no meio não conta a partida, mas continua em quadra"` |

## 20. Estatísticas

`player_stats` e `head_to_head` (0015) são derivadas de `match_players` +
`matches` — o dado existe desde o v1, ninguém precisou registrar nada novo.

**O que NÃO sai delas:** contagem de votos por jogador. O que aparece é *quantas
vezes foi destaque* (top 3 da noite), que é o fato público. "Maria 17 · Victor 1"
transformaria a brincadeira em competição de popularidade (`RESUMO.md`).

---

## Migrations, na ordem

| Arquivo | O que faz |
|---|---|
| `0001_init.sql` | schema, RLS aberta, realtime. **Nunca re-executar** |
| `0002_court_state.sql` | `players.rating`, `sessions.champion_ids/streak`, `matches.champion_stays` |
| `0002_rls_tighten.sql` | fecha o `select` dos votos; cria `highlight_tally()` |
| `0003_fix_rls.sql` | devolve o `insert` dos votos |
| `0004_reset.sql` | `delete` em `matches` e votos, pro reset funcionar |
| `0005_rounds_waiting.sql` | `session_players.rounds_waiting` |
| `0006_placar.sql` | `matches.score_a/score_b`, ambos NULL-áveis |
| `0007_policies_reassert.sql` | reescreve as policies (superada pela `0014`) |
| `0008_highlight_days.sql` | `highlight_days()` — destaques por noite, agregados |
| `0009_highlight_voters.sql` | `highlight_voters()` — quem votou, sem em quem |
| `0010_placar_live.sql` | placar no banco: `bump_score`, `reset_score` |
| `0011_team_sides.sql` | lado do time: `holder_team`, `champion_team`, `swap_sides` |
| `0012_peladas.sql` | **peladas**, membros, nota por pelada; migra os dados existentes |
| `0013_auth_profiles.sql` | contas, foto, `claim_player`, `join_as_guest` |
| `0014_rls_roles.sql` | **fonte da verdade das policies** — papéis de verdade |
| `0015_stats.sql` | `player_stats`, `head_to_head`, destaques por pelada |
| `0016_substitutions.sql` | `joined_mid` / `substituted_for` |
| `0017_pelada_join_flow.sql` | `create_pelada`, `join_pelada`, `ensure_player` |

A ordem de execução, as armadilhas e a configuração do painel do Supabase
estão em [`supabase/migrations/README.md`](./supabase/migrations/README.md) —
incluindo o motivo de a `0001` nunca poder ser re-executada e qual migration é,
hoje, a fonte da verdade das policies — a `0014`. A `0007` fazia esse papel no
mundo do v1, sem peladas.

⚠️ **Ordem de subida da 0012 em diante:** aplique `0010`–`0013`, habilite
"Anonymous sign-ins" no painel, **suba o deploy novo**, e só então rode a
`0014`. A `0012` é retrocompatível de propósito (o app antigo continua rodando
com ela aplicada), pra não existir janela de site quebrado; a `0014` não é — ela
exige o app que faz login anônimo.

## Como rodar os testes

```bash
npx vitest run     # 62 testes
npx tsc --noEmit   # tipos
npm run smoke      # ponta a ponta, numa pelada descartável
```
