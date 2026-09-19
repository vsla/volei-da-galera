# PRP v3 — a lista sem SQL

Cadastrar os nomes da sexta **no painel**, antes de a lista abrir.

---

## O problema

Toda sexta a lista chega no WhatsApp assim:

```
Vôlei Sexta 11/09| Prainha ZN
21-23h30 | 18,34 pra cada
Pix: 81984453412 - Lênin Pastichi

 1. Miguel
 2. Suzana Rodrigues
 ...
14. Guilherme (Lê)
15. Anthony (Lê)
```

E hoje o caminho dessa lista até a tela de check-in é **um arquivo `.sql` escrito
à mão e rodado no SQL Editor do Supabase** — `supabase/roster_2026_09_04.sql`,
`supabase/roster_2026_09_11.sql`. Isso tem quatro defeitos, em ordem de
gravidade:

1. **só eu consigo fazer.** Quem organiza a pelada não abre o painel do Supabase.
   O app tem papel de `owner` e `admin` (§16 do `reasonable.md`) e nenhum dos
   dois serve pra montar a lista da semana;
2. **apaga a nota de todo mundo.** Os rosters começam com `delete from players`,
   porque era o único jeito de "trocar a lista" sem uma tela. Cada sexta zera o
   auto-nivelamento (§3) e o histórico (§13) — o app esquece o que aprendeu;
3. **a data mora no SQL.** A tela de check-in só encontra a sessão se a data for
   hoje no fuso de São Paulo. Errar a linha (aconteceu: a lista dizia "24/09",
   que não era sexta) = tela vazia na praia, 21h, sem quem consertar;
4. **precisa de um deploy mental.** Nome que chega em cima da hora ("o Arthur vai
   hoje") não tem caminho nenhum pela tela — a não ser entrar como convidado
   avulso, que é outra coisa: cria jogador `is_guest` fora da lista de habituais.

O v3 é pequeno de propósito: **uma tela, uma função de banco, zero schema novo.**

---

## O que já existe

| Peça | Onde | O que faz |
| --- | --- | --- |
| `join_as_guest(p_pelada, p_name)` | `0022_sem_contas.sql` | cria `players` + `pelada_members` num passo. Mas **sempre** `role = 'guest'` e **sempre** cria nome novo (duplica se rodar duas vezes) |
| `ensure_player(p_name, p_player)` | `0022_sem_contas.sql` | cria/recupera o jogador **do aparelho** (localStorage). Não serve pra cadastrar terceiros |
| `fetchMembers` / `setMemberRole` / `removeMember` | `src/lib/db.ts` | o painel lê e edita quem já é membro |
| `AdminPanel`, aba *membros* | `src/components/AdminPanel.tsx` | lista, muda papel, remove. **Não adiciona** |
| `ensureTodaySession(peladaId, date)` | `src/lib/db.ts` | cria a noite. Hoje só é chamada no **primeiro check-in** |
| `fetchState` | `src/lib/db.ts` | é `pelada_members` que vira a tela de check-in — então somar membro é somar nome na tela |

O modelo de dados **já aguenta** o v3. `pelada_members` tem `status`
(`active`/`removed`), `role` e `rating` por pelada. Nada de migration de schema.

---

## 1. A decisão que define o resto

Quando a lista da semana é colada, **o que acontece com quem não está nela?**

- **(a) só adiciona.** O painel só soma nomes. A lista de check-in cresce sexta a
  sexta e em dois meses tem 60 nomes, dos quais 15 jogam. A busca do `NamePicker`
  salva, mas a tela deixa de ser "a lista de hoje";
- **(b) sincroniza.** Quem não está na lista colada vira `status = 'removed'` —
  sai da tela, **fica no banco**: nota, histórico e partidas intactas. Voltar é
  colar o nome de novo na semana seguinte, e a nota volta com ele.

**O v3 adota (b).** É o que os `.sql` de reset faziam na prática — a diferença é
que (b) não apaga nada. E é reversível de um toque, o que o `delete` nunca foi.

Duas travas em cima disso, porque sincronizar é a única operação aqui que
*remove* coisa:

- **prévia obrigatória.** Colar não grava. Mostra três colunas — *entram*,
  *ficam*, *saem* — e só grava no segundo toque. Mesma regra do §12
  (confirmação nas ações críticas);
- **quem organiza nunca sai.** `owner` e `admin` são imunes à sincronização,
  mesmo fora da lista. Quem monta a lista às vezes não joga, e uma pelada sem
  organizador é irrecuperável pela tela (foi a lição da `0017`).

---

## 2. O banco — `0019_lista_no_painel.sql`

Uma função. `security definer`, `grant execute to anon`, no mesmo molde da
`0022` (§9: *escrita que depende de outra escrita mora numa função do banco*).

```sql
-- Cadastra um nome na pelada. Idempotente: rodar de novo devolve o
-- mesmo jogador em vez de criar um homônimo.
create or replace function add_member(
  p_pelada uuid,
  p_name   text,
  p_guest  boolean default false
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_name   text := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  v_player uuid;
begin
  if v_name is null then raise exception 'diga o nome'; end if;

  -- Já é desta pelada? Compara sem acento e sem caixa: a lista do grupo
  -- escreve "Lenin Pastichi" e o banco tem "Lênin Pastichi".
  select m.player_id into v_player
    from pelada_members m join players p on p.id = m.player_id
   where m.pelada_id = p_pelada
     and lower(unaccent(p.name)) = lower(unaccent(v_name))
   limit 1;

  if v_player is not null then
    -- voltou depois de uma semana fora: reativa, não duplica
    update pelada_members set status = 'active'
     where pelada_id = p_pelada and player_id = v_player and status <> 'active';
    return v_player;
  end if;

  insert into players (name, is_guest) values (v_name, p_guest)
  returning id into v_player;

  insert into pelada_members (pelada_id, player_id, role)
  values (p_pelada, v_player, case when p_guest then 'guest' else 'player' end)
  on conflict (pelada_id, player_id) do nothing;

  return v_player;
end $$;
```

Mais três coisas na mesma migration:

- `create extension if not exists unaccent;` — é o que faz "Lenin" achar
  "Lênin". Sem isso a lista colada duplica metade dos nomes;
- `sync_members(p_pelada uuid, p_names text[])` — marca `removed` quem não está
  no array, **exceto** `owner`/`admin`, e devolve quantos saíram. Uma chamada,
  uma transação: sincronizar pela metade é pior que não sincronizar;
- os `grant execute … to anon, authenticated` das duas.

**Por que não `unique (pelada_id, lower(unaccent(name)))`?** Porque
`Guilherme (Lê)` e `Guilherme (Ito)` são duas pessoas, `Thiago` e `Ítalo Thiago`
também, e uma constraint transformaria isso em erro cru na tela. A unicidade
aqui é um *palpite* pra não duplicar, não uma regra do domínio — então mora na
função, onde a prévia mostra o palpite antes de gravar.

---

## 3. O cliente — `src/lib/db.ts`

```ts
addMember(peladaId, name, isGuest?): Promise<string>
addMembers(peladaId, names: ParsedName[]): Promise<{ criados: number; jaEstavam: number }>
syncMembers(peladaId, names: string[]): Promise<{ sairam: string[] }>
```

E o parser, que é o coração do v3 — `src/lib/roster-parse.ts`, puro, testável
sem banco:

```ts
export type ParsedName = { name: string; isGuest: boolean };
export function parseRoster(text: string): ParsedName[];
```

O que ele tira de cada linha, medido contra as listas reais de 04/09 e 11/09:

- **numeração**: `1. `, ` 1.⁠ ⁠`, `10.⁠ ⁠` — inclusive o `⁠` (U+2060, *word
  joiner*) que o WhatsApp do iOS enfia entre o ponto e o nome. É invisível e
  quebra qualquer `split` ingênuo;
- **o duplicado da primeira linha**: a lista de 11/09 chegou com `1.⁠ ⁠⁠1. Miguel`;
- **`✅`** e emoji no fim do nome — é pix pago, **não é presença** (a lista de
  11/09 tinha um; o roster de 04/09 já documentava isso);
- **cabeçalho**: linha com data (`Vôlei Sexta 11/09`), horário (`21-23h30`),
  valor (`18,34 pra cada`), `Pix:`, telefone. Heurística: linha sem numeração e
  **antes** da primeira linha numerada é cabeçalho;
- **vazias** e espaço duplicado.

E o que ele decide: **nome com parênteses é convidado.** `Guilherme (Lê)`,
`Mucio (Vitória)` — o anfitrião entre parênteses é a convenção do grupo e já era
a regra dos dois rosters (§3 do `roster_2026_09_04.sql`). Continua no nome, não
vira coluna: é assim que procuram na tela, e é o que separa dois homônimos.

Testes (`src/lib/roster-parse.test.ts`): as duas listas reais colam e devolvem
17+6 e 13+2. Isso é a fixture, não um caso inventado.

---

## 4. A tela — `AdminPanel`, aba *membros*

Dois caminhos, porque são dois momentos diferentes:

**Um nome** — input + `adicionar`. É o "o Arthur vai hoje" das 20h50, digitado
em pé. Um campo, um toque, o nome aparece na lista acima.

**Colar a lista** — textarea + `conferir`. Sexta de manhã, sentado. Cola o bloco
do WhatsApp inteiro, sem editar nada. A prévia mostra:

```
ENTRAM (4)     João · Arthur Farias · Thiago · Nickole
FICAM (11)     Miguel · Suzana · Talisson · Vitor Attar · …
SAEM (12)      Antonella · Victor Alves · Neto · Matheus · …
               nota e histórico ficam no banco — voltam se o nome voltar
```

`gravar` aplica. `cancelar` não escreve nada. A lista de *saem* é a que precisa
da frase embaixo: sem ela, "saem 12" parece perda de dados, e é exatamente o
medo que os `delete from players` mereciam.

Tudo atrás de `canEdit` (`owner`/`admin`), que a aba já calcula.

---

## 5. Abrir a noite pelo painel

Botão `abrir a noite de hoje` — chama `ensureTodaySession` com a data de São
Paulo calculada **no cliente**, não escrita à mão. Resolve o defeito (3): a data
deixa de ser uma linha de SQL que dá pra errar.

Não substitui o comportamento atual (o primeiro check-in ainda cria a sessão, e
é bom que crie — pelada sem organizador presente continua funcionando). É só um
caminho explícito pra quem quer a lista de pé antes de a galera chegar.

Mostra, ao lado: `noite de 11/09 aberta · 0 check-ins`.

---

## 6. Fases

### F1 — parser + testes ⏱ ~2h
`src/lib/roster-parse.ts` e `roster-parse.test.ts`. As duas listas reais como
fixture. **Nada de banco, nada de tela** — é a parte que erra mais e a mais
barata de verificar.

### F2 — `0019_lista_no_painel.sql` ⏱ ~2h
`unaccent`, `add_member`, `sync_members`, grants. Aplicar no Supabase e conferir
à mão: adicionar duas vezes o mesmo nome dá um jogador só; sincronizar não
derruba o `owner`.

### F3 — `db.ts` + um nome no painel ⏱ ~2h
`addMember`/`addMembers`/`syncMembers` e o input de um nome. **Já entrega valor
sozinho**: dá pra montar a lista da sexta digitando 15 nomes, sem SQL. Se o v3
parar aqui, o problema principal (1) já está resolvido.

### F4 — colar a lista + prévia ⏱ ~3h
Textarea, as três colunas, `gravar`/`cancelar`.

### F5 — abrir a noite ⏱ ~1h
O botão e a linha de status.

**Ordem de corte:** F5 e F4 são as dispensáveis, nessa ordem. F1→F3 é o v3
mínimo.

---

## 7. O que fica de fora, de propósito

- **importar contato / integração com o WhatsApp.** Colar texto é o formato
  nativo do problema. Qualquer coisa além disso é integração com uma plataforma
  que não tem API pra isso;
- **lista de espera / fila de confirmação** ("os 15 primeiros jogam"). A lista do
  grupo já chega decidida; o app não precisa opinar sobre quem entrou primeiro;
- **cobrança / controle de pix.** Os `✅` da lista são pix pago e o v3
  deliberadamente os **ignora**. Dinheiro entre amigos é assunto do grupo, não do
  app — e ler o `✅` como presença já seria errado (ninguém entra com check-in
  feito);
- **apagar jogador de verdade.** `removed` basta pra tela. `delete` existe no SQL
  Editor pra quando for necessário, e agora só pra isso.

---

## 8. Riscos

| Risco | O que acontece | Mitigação |
| --- | --- | --- |
| Parser erra um nome esquisito | Nome sujo entra na lista (`10.⁠ ⁠Nickole`) | A prévia é a mitigação: o nome aparece antes de gravar. Editável no campo de um nome |
| Homônimo colapsa em um | Dois `Thiago` viram um | Parênteses são a convenção do grupo pra isso, e a prévia mostra *entram: 1* quando esperava 2 |
| Sincronizar remove o organizador | Pelada sem quem administre | `owner`/`admin` imunes, na própria função do banco |
| `unaccent` não existe no projeto | `0019` falha na primeira linha | `create extension if not exists` na migration; conferir na aplicação |
| Qualquer um chama `add_member` | Alguém de fora enche a lista | Mesma exposição de `join_as_guest` hoje. A `0022` trocou RLS por confiança entre amigos de propósito — o v3 não muda essa decisão, e não é ele que deve mudá-la |

---

## 9. Perguntas em aberto

1. **`sync_members` deve mexer em convidado?** A favor: convidado é por natureza
   de uma noite, e deixá-lo `active` polui a lista. Contra: `Guilherme (Lê)` veio
   nas duas sextas — já não é bem convidado. **Palpite:** sincroniza igual, e
   quem repete o organizador promove pra `player` no painel (já dá).
2. **A lista colada deve criar a sessão junto?** Colar a lista da sexta e a noite
   abrir no mesmo toque é menos um passo. Mas junta duas ações com riscos
   diferentes num botão só. **Palpite:** não — F5 fica separada.
3. **Guardar o texto colado?** Um `sessions.settings.rosterRaw` daria pra
   conferir depois "o que o grupo mandou" contra "o que o app entendeu". É
   barato. **Palpite:** sim, na F4, sem tela nenhuma lendo por enquanto.

---

## 10. Definição de pronto

- `npx tsc --noEmit` limpo e `npx vitest run` verde, com os testes do parser
  somados aos 62 existentes;
- `0019` **aplicada** num banco de verdade — a `0017` ensinou que migration lida
  e não aplicada não conta;
- o caminho da sexta feito ponta a ponta pela tela, sem abrir o SQL Editor:
  colar a lista de 11/09 → prévia → gravar → abrir a noite → um check-in de
  aparelho de verdade;
- `reasonable.md` com uma seção nova (§21, *a lista da semana*) explicando (b) e
  por que `removed` em vez de `delete`;
- `README.md` com `0019` na ordem de subida.
