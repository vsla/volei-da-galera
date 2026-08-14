-- Pronto pra testar partida.
-- Cola no SQL Editor do Supabase e roda.
--
-- O que faz:
--   1. garante a lista de jogadores
--   2. abre/reusa a sessão que o app mostra (a de data mais recente)
--   3. limpa partida ativa, campeão e votos
--   4. faz check-in dos 12 primeiros (6x6)
--
-- Depois: no app, entra como organizador (PIN) → "Gerar próxima".

-- ── 0. jogadores (idempotente) ────────────────────────────────
insert into players (name)
select v.name
from (values
  ('Miguel'), ('Vinícius Lamarck'), ('Amanda Lavs'), ('Arthur Farias'),
  ('Maria Gabrielly'), ('Suzana Rodrigues'), ('Pedro Augusto'), ('Brenda Dias'),
  ('Ewerton'), ('Lenin Pastichi'), ('Álvaro Gabriel'), ('Ítalo Thiago'),
  ('Leandro'), ('João Victor'), ('Mateus'), ('Guilherme'),
  ('Victor'), ('João'), ('Alisson'), ('Brenno'),
  ('Neto'), ('Fefa'), ('Baca'), ('Bia'), ('Tali')
) as v(name)
where not exists (select 1 from players p where p.name = v.name);

-- ── 1. sessão alvo = a que o app lê (mais recente) ────────────
-- se não existir nenhuma, cria a de hoje
insert into sessions (date, status, team_size, max_streak)
select current_date, 'open', 6, 2
where not exists (select 1 from sessions);

update sessions s
set status = 'open',
    team_size = 6,
    max_streak = 2,
    champion_ids = '{}',
    champion_streak = 0
where s.id = (select id from sessions order by date desc limit 1);

-- ── 2. limpa a noite ──────────────────────────────────────────
with s as (
  select id from sessions order by date desc limit 1
)
delete from match_players
where match_id in (select m.id from matches m join s on m.session_id = s.id);

with s as (
  select id from sessions order by date desc limit 1
)
delete from matches
where session_id in (select id from s);

with s as (
  select id from sessions order by date desc limit 1
)
delete from highlight_votes
where session_id in (select id from s);

with s as (
  select id from sessions order by date desc limit 1
)
delete from session_players
where session_id in (select id from s);

-- ── 3. check-in dos 12 primeiros (chega pra 6x6) ──────────────
insert into session_players (session_id, player_id, checked_in_at, games_played, excluded)
select
  s.id,
  p.id,
  now(),
  0,
  false
from (select id from sessions order by date desc limit 1) s
cross join lateral (
  select id
  from players
  where coalesce(is_guest, false) = false
  order by name
  limit 12
) p;

-- ── confere ───────────────────────────────────────────────────
select
  s.date,
  s.status,
  s.team_size,
  count(sp.player_id) as na_praia,
  (s.team_size * 2) as precisa
from sessions s
left join session_players sp
  on sp.session_id = s.id and sp.checked_in_at is not null
where s.id = (select id from sessions order by date desc limit 1)
group by s.id;
