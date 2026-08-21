-- 0015 — ESTATÍSTICAS
--
-- Playtest 01: "deve ter estatísticas que você pode montar, tipo
-- 'ganhei todas de fulaninho'".
--
-- Nada aqui exige dado novo: `match_players` + `matches` guardam quem
-- jogou com quem, contra quem e quem ganhou desde o v1. São views de
-- leitura, e por isso o custo de ter é quase zero.
--
-- REGRA QUE NÃO SE NEGOCIA: nenhuma função daqui devolve contagem de
-- votos por jogador. "Maria 17 · Victor 1" transformaria a brincadeira
-- em competição de popularidade (RESUMO.md). O que sai é "quantas vezes
-- foi destaque", que é o fato público — quem subiu no pódio da noite.

-- ─────────────────────────────────────────────────────────────
-- os destaques de cada noite, agora POR PELADA
--
-- A `highlight_days` da 0008 varria as sessões do banco inteiro — o que
-- estava certo quando existia uma pelada só. Com várias, ela misturaria
-- o vôlei da sexta com o de domingo.
-- ─────────────────────────────────────────────────────────────
create or replace function highlight_days_pelada(
  p_pelada uuid,
  p_limit  int default 30
)
returns table (
  session_id uuid,
  played_on  date,
  player_id  uuid,
  name       text,
  votes      bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recentes as (
    select id, date from sessions
     where pelada_id = p_pelada
     order by date desc
     limit p_limit
  ),
  contagem as (
    select
      v.session_id,
      r.date as played_on,
      v.player_id,
      p.name,
      count(*)::bigint as votes,
      row_number() over (
        partition by v.session_id
        order by count(*) desc, p.name
      ) as pos
    from highlight_votes v
    join recentes r on r.id = v.session_id
    join players  p on p.id = v.player_id
    group by v.session_id, r.date, v.player_id, p.name
  )
  select session_id, played_on, player_id, name, votes
    from contagem
   where pos <= 3
   order by played_on desc, name;
$$;

-- ─────────────────────────────────────────────────────────────
-- player_stats — o resumo de cada um dentro da pelada
-- ─────────────────────────────────────────────────────────────
create or replace function player_stats(p_pelada uuid)
returns table (
  player_id  uuid,
  name       text,
  games      int,
  wins       int,
  losses     int,
  highlights int,
  rating     numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with jogadas as (
    select mp.player_id,
           (m.winner_team = mp.team) as won
      from match_players mp
      join matches  m on m.id = mp.match_id and m.status = 'finished'
      join sessions s on s.id = m.session_id
     where s.pelada_id = p_pelada
       and m.winner_team is not null
  ),
  agg as (
    select player_id,
           count(*)::int                          as games,
           count(*) filter (where won)::int       as wins,
           count(*) filter (where not won)::int   as losses
      from jogadas
     group by player_id
  ),
  -- "quantas vezes foi destaque" = quantas vezes ficou no top 3 da
  -- noite. Nunca quantos votos levou.
  destaques as (
    select player_id, count(*)::int as vezes
      from (
        select v.player_id,
               row_number() over (
                 partition by v.session_id
                 order by count(*) desc, v.player_id
               ) as pos
          from highlight_votes v
          join sessions s on s.id = v.session_id
         where s.pelada_id = p_pelada
         group by v.session_id, v.player_id
      ) ranked
     where pos <= 3
     group by player_id
  )
  select coalesce(a.player_id, d.player_id, m.player_id) as player_id,
         p.name,
         coalesce(a.games, 0),
         coalesce(a.wins, 0),
         coalesce(a.losses, 0),
         coalesce(d.vezes, 0),
         m.rating
    from pelada_members m
    join players p on p.id = m.player_id
    left join agg       a on a.player_id = m.player_id
    left join destaques d on d.player_id = m.player_id
   where m.pelada_id = p_pelada
     and m.status <> 'removed'
   order by coalesce(a.wins, 0) desc, coalesce(a.games, 0) desc, p.name;
$$;

-- ─────────────────────────────────────────────────────────────
-- head_to_head — "ganhei todas de fulaninho"
--
-- Duas relações diferentes, e a graça está em ver as duas: quantas
-- vezes vocês jogaram JUNTOS (e ganharam juntos) e quantas vezes
-- jogaram CONTRA (e quem levou).
-- ─────────────────────────────────────────────────────────────
create or replace function head_to_head(p_pelada uuid, p_a uuid, p_b uuid)
returns table (
  games_together int,
  wins_together  int,
  games_against  int,
  wins_a         int,
  wins_b         int
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with pares as (
    select m.id,
           a.team as team_a,
           b.team as team_b,
           m.winner_team
      from matches m
      join sessions s on s.id = m.session_id
      join match_players a on a.match_id = m.id and a.player_id = p_a
      join match_players b on b.match_id = m.id and b.player_id = p_b
     where s.pelada_id = p_pelada
       and m.status = 'finished'
       and m.winner_team is not null
  )
  select
    count(*) filter (where team_a =  team_b)::int,
    count(*) filter (where team_a =  team_b and winner_team = team_a)::int,
    count(*) filter (where team_a <> team_b)::int,
    count(*) filter (where team_a <> team_b and winner_team = team_a)::int,
    count(*) filter (where team_a <> team_b and winner_team = team_b)::int
  from pares;
$$;

revoke all on function highlight_days_pelada(uuid, int) from public;
revoke all on function player_stats(uuid)               from public;
revoke all on function head_to_head(uuid, uuid, uuid)   from public;

grant execute on function highlight_days_pelada(uuid, int) to anon, authenticated;
grant execute on function player_stats(uuid)               to anon, authenticated;
grant execute on function head_to_head(uuid, uuid, uuid)   to anon, authenticated;
