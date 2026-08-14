-- Vôlei Prainha ZN — estado da quadra e nota
-- Rodar no SQL Editor do Supabase, depois de 0002.
--
-- O app já lia e gravava estas colunas (src/lib/db.ts), mas nenhuma
-- migration as criava: quem rodasse só a 0001 tomava erro ao finalizar
-- a primeira partida.

-- nota do jogador — acumulada de todas as noites, não do dia
alter table players
  add column if not exists rating numeric(4,2) not null default 5
    check (rating >= 0 and rating <= 10);

-- quem está segurando a quadra agora, e há quantas vitórias
alter table sessions
  add column if not exists champion_ids uuid[] not null default '{}',
  add column if not exists champion_streak int not null default 0;

-- na hora do sorteio, o campeão entrou defendendo a quadra?
-- (matches.champion_streak já vem da 0001)
alter table matches
  add column if not exists champion_stays boolean not null default false;

-- ─────────────────────────────────────────────────────────────
-- DELETE em matches, só enquanto a partida está em aberto
--
-- A 0002 tirou o delete de matches inteiro, e com razão: apagar uma
-- partida encerrada apaga o histórico da noite via cascade. Só que o
-- app precisa limpar rascunho e partida órfã (db.ts:251, db.ts:279) —
-- sem isso, uma falha ao gravar os times deixa uma partida ativa e
-- vazia travando a rodada.
--
-- `using (status = 'active')` resolve os dois: rascunho some, história
-- fica. Uma partida encerrada não volta a ser 'active' — o app só
-- reabre a rodada ativa, nunca uma finalizada.
-- ─────────────────────────────────────────────────────────────
drop policy if exists matches_delete_active on matches;
create policy matches_delete_active on matches
  for delete to anon, authenticated using (status = 'active');
