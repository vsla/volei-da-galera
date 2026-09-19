-- Lista da sexta 11/09 — Prainha ZN
-- 21h–23h30 · R$ 18,34 pra cada · Pix 81984453412 (Lênin Pastichi)
--
-- RESET + lista da noite, no mesmo molde do roster_2026_09_04.sql. Rode no
-- SQL Editor do Supabase (só ele passa por cima da RLS da 0014). Pode rodar
-- de novo: o resultado é sempre o mesmo estado final.
--
-- ⚠️  O QUE ISSO APAGA, do banco inteiro: partidas, escalações, sessões,
--     check-ins, votos de destaque, os jogadores e a nota de cada um (todo
--     mundo recomeça em 5). A pelada `prainha-zn` e o join_code PRAINHA ficam.
--
-- O ✅ do Vinicius na lista é o pix pago, não presença — ninguém entra com
-- check-in feito: cada um toca "EU CHEGUEI" na praia.
--

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. Zera. A ordem é filho → pai; players leva o resto por cascade.
-- ─────────────────────────────────────────────────────────────
delete from highlight_votes;
delete from match_players;
delete from matches;
delete from session_players;
delete from sessions;
delete from pelada_members;
delete from players;

-- ─────────────────────────────────────────────────────────────
-- 2. Os 13 da lista, na ordem do grupo.
-- ─────────────────────────────────────────────────────────────
insert into players (name)
values
  ('Miguel'),              ('Suzana Rodrigues'),  ('João'),           ('Arthur Farias'),
  ('Talisson Mendes'),     ('Vitor Attar'),        ('Vinicius Lamarck'), ('Thiago'),
  ('Ewerton Eduardo'),     ('Álvaro Gabriel'),    ('Nickole'),        ('Lênin Pastichi'),
  ('Ítalo Thiago');

-- ─────────────────────────────────────────────────────────────
-- 3. Os 2 convidados. O anfitrião fica entre parênteses porque é assim
--    que procuram na tela — e é o que separa dois nomes iguais.
-- ─────────────────────────────────────────────────────────────
insert into players (name, is_guest)
values
  ('Guilherme (Lê)', true),
  ('Anthony (Lê)',   true);

-- ─────────────────────────────────────────────────────────────
-- 4. Todos viram membros da pelada — é a lista de membros que vira a
--    tela de check-in (`fetchState` lê `pelada_members`).
-- ─────────────────────────────────────────────────────────────
insert into pelada_members (pelada_id, player_id, role)
select pl.id, p.id, 'player'
  from peladas pl, players p
 where pl.slug = 'prainha-zn';

-- ─────────────────────────────────────────────────────────────
-- 5. A noite, aberta e vazia: cada um faz o próprio check-in.
--    A tela só acha a sessão se a data for HOJE no fuso de São Paulo.
-- ─────────────────────────────────────────────────────────────
insert into sessions (pelada_id, date, status, team_size)
select pl.id, date '2026-09-11', 'open', 6
  from peladas pl
 where pl.slug = 'prainha-zn';

commit;

-- Conferência: 15 nomes, nenhum check-in, uma sessão aberta.
select (select count(*) from players)                     as jogadores,
       (select count(*) from players where is_guest)      as convidados,
       (select count(*) from pelada_members)              as membros,
       (select count(*) from session_players)             as check_ins,
       (select count(*) from matches)                     as partidas,
       (select date::text || ' ' || status from sessions) as sessao;
