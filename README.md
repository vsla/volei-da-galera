# 🏐 Vôlei Prainha ZN

Site mobile-first pra organizar o vôlei de toda sexta na Prainha ZN. ~25 pessoas,
1 quadra, 6×6 na areia.

O diferencial não é o sorteio — é a **tela ao vivo**: cada um faz o próprio
check-in e vê a posição na fila em tempo real, todo mundo vendo o mesmo estado.

Em produção: https://volei-da-galera.vercel.app

---

## 📖 Comece por aqui

**[`reasonable.md`](./reasonable.md) — o que foi feito, por quê, e onde está o
teste de cada regra.**

Se você é novo no projeto, leia esse arquivo antes do código. Ele explica as
decisões (por que a nota não aparece na tela, por que quem ganha às vezes sai da
quadra, até onde o equilíbrio pode furar a fila) e aponta o teste que trava cada
uma. Toda regra listada lá tem um teste com nome parecido — se você mudar a regra
e nenhum teste quebrar, o teste está errado.

Complementos:

- [`RESUMO.md`](./RESUMO.md) — as decisões de produto e o porquê de cada uma
- [`PRP.md`](./PRP.md) — o plano de implementação do v1
- [`PLAYTEST-01.md`](./PLAYTEST-01.md) — o que a primeira pelada com o site
  revelou: o que funcionou, o que quebrou e a causa de cada coisa no código
- [`PRP-V2.md`](./PRP-V2.md) — o plano a partir dali: multi-pelada, papéis,
  painéis, placar ao vivo e estatísticas. As contas com foto que ele previa
  foram desfeitas pela `0022` — veja o cabeçalho dela

## Rodando

```bash
npm install
cp .env.example .env.local   # preencha as chaves do Supabase e o PIN
npm run dev
```

Variáveis (`.env.example`):

| Variável | O que é |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave pública (vai no bundle) |
| `ORGANIZER_PIN` | senha do modo organizador |

## Banco

As migrations ficam em `supabase/migrations/`. Rode **na ordem**, no SQL Editor
do Supabase. A tabela com o que cada uma faz está no
[`reasonable.md`](./reasonable.md#migrations-na-ordem).

⚠️ Ordem, da `0012` em diante:

1. aplique `0010`–`0017` na ordem;
2. aplique `0018`–`0021` — destaques e voto: reler o próprio voto sem conta,
   trocar o voto numa transação só, empate na última vaga;
3. rode a **`0022`**, que é a fonte da verdade das policies hoje. Ela desfaz as
   contas da `0013`/`0014`: identidade volta a ser um toque no nome, guardado no
   aparelho, e quem tem o link escreve. O motivo está no cabeçalho dela;
4. rode a **`0023`**, que traz a lista da semana pro painel (`add_member`,
   `sync_members`). Ela casa nome sem acento pela `unaccent_safe` da `0017`,
   não pela extensão `unaccent` — então depende da `0017` ter subido;
5. rode a **`0024`**, que conserta o `join_pelada`: entrar por código
   estourava `column reference "player_id" is ambiguous`. A correção já
   estava escrita no arquivo da `0022`, mas o banco tinha a versão anterior
   — o arquivo foi corrigido depois de aplicado;
6. rode a **`0025`**, que desengaveta o convite por link (`admin_add_roster_member`,
   `claim_roster_invite`) — as duas tinham o mesmo defeito da `0024`. Ela também
   faz a lista da semana poupar quem está `invited`, pra convite pendente não
   sumir na colagem de sexta;
7. **passo manual, uma vez por pelada:** quem organiza precisa ter conta E o
   jogador dele reivindicado, senão `is_pelada_admin()` devolve false e o banco
   recusa o convite pro dono inclusive;
8. confira com **dois aparelhos** que a tela ao vivo continua atualizando
   (realtime respeita RLS: policy errada não dá erro, só para de atualizar).

Não precisa de login nenhum no painel — nem Anonymous sign-ins, nem Google. O
app não autentica.

## Rotas

| URL | O que é |
|---|---|
| `/` | suas peladas (manda direto pra última aberta) |
| `/p/<slug>` | a quadra ao vivo daquela pelada |
| `/p/<slug>/admin` | membros, papéis e regras |
| `/p/<slug>/stats` | números da pelada e "eu × alguém" |
| `/p/<slug>/destaques` | os destaques de cada noite |

## Testes

```bash
npx vitest run     # regras de fila, equilíbrio e rotação
npx tsc --noEmit   # tipos
```

A lógica de sorteio (`src/lib/match-generator.ts`) e de rotação
(`src/lib/rotation.ts`) são funções puras, sem UI e sem banco — é onde os testes
moram e onde qualquer mudança de regra deve começar.

## Origem

A rotação e o sistema de notas vêm do bot de Telegram que o Neto fez pra pelada:
[N3tto/pelada-volei](https://github.com/N3tto/pelada-volei). As diferenças estão
anotadas no [`reasonable.md`](./reasonable.md).
