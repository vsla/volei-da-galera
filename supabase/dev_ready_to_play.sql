-- Pronto pra testar partida.
-- Cola no SQL Editor do Supabase e roda.
--
-- O que faz, sempre na pelada 'prainha-zn':
--   1. garante a pelada, os jogadores e os membros
--   2. abre/reusa a sessão mais recente DELA
--   3. limpa partida ativa, campeão, placar e votos
--   4. faz check-in dos 12 primeiros (6x6)
--
-- Depois: no app, abre /p/prainha-zn, entra como organizador (PIN) →
-- "Gerar próxima".

-- ── 0. pelada, jogadores e membros (idempotente) ──────────────
insert into peladas (slug, name, weekday, join_code)
select 'prainha-zn', 'Vôlei da Sexta — Prainha ZN', 5, 'PRAINHA'
where not exists (select 1 from peladas where slug = 'prainha-zn');

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

insert into pelada_members (pelada_id, player_id, role)
select pl.id, p.id, 'player'
  from peladas pl, players p
 where pl.slug = 'prainha-zn'
   and coalesce(p.is_guest, false) = false
on conflict (pelada_id, player_id) do nothing;

-- ── 1. sessão alvo = a mais recente DESTA pelada ──────────────
insert into sessions (pelada_id, date, status, team_size, max_streak)
select pl.id, current_date, 'open', 6, 2
  from peladas pl
 where pl.slug = 'prainha-zn'
   and not exists (
     select 1 from sessions s
      join peladas p2 on p2.id = s.pelada_id
     where p2.slug = 'prainha-zn'
   );

create temporary table alvo as
select s.id
  from sessions s
  join peladas p on p.id = s.pelada_id
 where p.slug = 'prainha-zn'
 order by s.date desc
 limit 1;

update sessions
   set status = 'open',
       team_size = 6,
       max_streak = 2,
       champion_ids = '{}',
       champion_streak = 0,
       champion_team = null
 where id in (select id from alvo);

-- ── 2. limpa a noite ──────────────────────────────────────────
delete from match_players
 where match_id in (select id from matches where session_id in (select id from alvo));

delete from matches        where session_id in (select id from alvo);
delete from highlight_votes where session_id in (select id from alvo);
delete from session_players where session_id in (select id from alvo);

-- ── 3. check-in dos 12 primeiros (chega pra 6x6) ──────────────
insert into session_players (session_id, player_id, checked_in_at, games_played, excluded)
select a.id, p.id, now(), 0, false
  from alvo a
  cross join lateral (
    select pm.player_id as id
      from pelada_members pm
      join peladas pl on pl.id = pm.pelada_id
      join players  pr on pr.id = pm.player_id
     where pl.slug = 'prainha-zn'
       and pm.status = 'active'
     order by pr.name
     limit 12
  ) p;

-- ── confere ───────────────────────────────────────────────────
select s.date, s.status, s.team_size,
       count(sp.player_id) as na_praia,
       (s.team_size * 2)   as precisa
  from sessions s
  left join session_players sp
    on sp.session_id = s.id and sp.checked_in_at is not null
 where s.id in (select id from alvo)
 group by s.id;

drop table alvo;
