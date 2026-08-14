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
- [`PRP.md`](./PRP.md) — o plano de implementação

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
