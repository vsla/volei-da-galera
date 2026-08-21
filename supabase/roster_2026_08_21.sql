-- Sexta 21/08/2026 — Prainha ZN
--
-- RESET + lista da noite. Rode no SQL Editor do Supabase (só ele passa
-- por cima da RLS da 0014). Pode rodar de novo: o resultado é sempre o
-- mesmo estado final.
--
-- ⚠️ O QUE ISSO APAGA, do banco inteiro:
--    · as 9 partidas e os 108 registros de escalação do playtest de 14/08
--    · as duas sessões (14/08 e 21/08) e os 25 check-ins delas
--    · os 39 jogadores cadastrados e a nota de cada um (todo mundo
--      recomeça em 5, como no bot)
--    A pelada `prainha-zn` em si fica de pé, com o join_code PRAINHA.

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
-- 2. Os 24 de hoje, na ordem da lista do grupo.
--    Quem veio com alguém mantém o anfitrião entre parênteses: é
--    assim que procuram na tela, e é o que separa os dois Joões.
-- ─────────────────────────────────────────────────────────────
insert into players (name)
values
  ('Anderson Nogueira'), ('Caio Cesar'),       ('Amanda Lays'),      ('Talisson Mendes'),
  ('Fernanda Paes'),     ('Matheus Paiva'),    ('Victor Alves'),     ('Antonela Carvalho'),
  ('Arthur Farias'),     ('Suzana Rodrigues'), ('Lamarck'),          ('Lenin Pastichi'),
  ('Ítalo Thiago'),      ('Miguel'),           ('Ewerton'),          ('Álvaro Gabriel'),
  ('João (Su)'),         ('Lauren (Alv)'),     ('Guilherme (Le)'),   ('Mesa 22 (Tali)'),
  ('Yuri (Lenin)'),      ('Hugo (Caio)'),      ('João B (Ito)'),     ('Deyse (Ito)');

-- ─────────────────────────────────────────────────────────────
-- 3. Todos viram membros da pelada — é a lista de membros que vira a
--    tela de check-in (`fetchState` lê `pelada_members`).
-- ─────────────────────────────────────────────────────────────
insert into pelada_members (pelada_id, player_id, role)
select pl.id, p.id, 'player'
  from peladas pl, players p
 where pl.slug = 'prainha-zn';

-- ─────────────────────────────────────────────────────────────
-- 4. A noite de hoje, aberta e vazia: cada um faz o próprio check-in.
-- ─────────────────────────────────────────────────────────────
insert into sessions (pelada_id, date, status, team_size)
select pl.id, date '2026-08-21', 'open', 6
  from peladas pl
 where pl.slug = 'prainha-zn';

commit;

-- Conferência: 24 nomes, nenhum check-in, uma sessão aberta.
select (select count(*) from players)                        as jogadores,
       (select count(*) from pelada_members)                 as membros,
       (select count(*) from session_players)                as check_ins,
       (select count(*) from matches)                        as partidas,
       (select date::text || ' ' || status from sessions)    as sessao;
