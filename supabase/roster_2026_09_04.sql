-- Lista da sexta — Prainha ZN
--
-- RESET + lista da noite. Rode no SQL Editor do Supabase (só ele passa
-- por cima da RLS da 0014). Pode rodar de novo: o resultado é sempre o
-- mesmo estado final.
--
-- ⚠️  A DATA DA SESSÃO está na seção 4. A tela de check-in só acha a
--     sessão se a data for HOJE no fuso de São Paulo — a lista do grupo
--     dizia "24/09", que não é sexta em 2026; deixei 2026-09-04, a sexta
--     de hoje. Troque a linha se for outra noite.
--
-- ⚠️  O QUE ISSO APAGA, do banco inteiro: partidas, escalações, sessões,
--     check-ins, votos de destaque, os jogadores e a nota de cada um
--     (todo mundo recomeça em 5, como no bot). A pelada `prainha-zn` e o
--     join_code PRAINHA ficam de pé.
--
-- Os ✅ da lista são o pix pago, não presença — então ninguém entra
-- com check-in feito: cada um toca "EU CHEGUEI" na praia.

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
-- 2. Os 17 habituais, na ordem da lista do grupo.
-- ─────────────────────────────────────────────────────────────
insert into players (name)
values
  ('Antonella Carvalho'), ('Victor Alves'),      ('Neto Araujo'),     ('Matheus Paiva'),
  ('Ewerton Eduardo'),    ('Pedro Augusto'),     ('Talisson'),        ('Suzana Rodrigues'),
  ('Vitória'),            ('Fernanda'),          ('Lênin Pastichi'),  ('Caio'),
  ('Álvaro Gabriel'),     ('Vinicius Lamarck'),  ('Ítalo Thiago'),    ('Miguel'),
  ('Vitor Attar');

-- ─────────────────────────────────────────────────────────────
-- 3. Os 6 convidados. O anfitrião fica entre parênteses porque é assim
--    que procuram na tela — e é o que separa dois nomes iguais.
-- ─────────────────────────────────────────────────────────────
insert into players (name, is_guest)
values
  ('Lauren (Alv)',        true),
  ('João Bernardo (Ito)', true),
  ('Mucio (Vitória)',     true),
  ('Guilherme (Lê)',      true),
  ('Anthony (Lê)',        true),
  ('Luizinho (Brenda)',   true);

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
--    ⚠️  TROQUE A DATA se não for hoje.
-- ─────────────────────────────────────────────────────────────
insert into sessions (pelada_id, date, status, team_size)
select pl.id, date '2026-09-04', 'open', 6
  from peladas pl
 where pl.slug = 'prainha-zn';

commit;

-- Conferência: 23 nomes, nenhum check-in, uma sessão aberta.
select (select count(*) from players)                        as jogadores,
       (select count(*) from players where is_guest)         as convidados,
       (select count(*) from pelada_members)                 as membros,
       (select count(*) from session_players)                as check_ins,
       (select count(*) from matches)                        as partidas,
       (select date::text || ' ' || status from sessions)    as sessao;
