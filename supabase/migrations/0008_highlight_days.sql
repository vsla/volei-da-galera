-- Vôlei Prainha ZN — destaques de todas as peladas
-- Rodar no SQL Editor do Supabase, depois de 0007.
--
-- A 0002 fechou o `select` em highlight_votes: voto é privado, ninguém
-- lê quem votou em quem. Só que a página de Destaques e o menu do
-- histórico precisam saber QUEM foram os destaques de cada noite — e a
-- leitura direta da tabela, agora, devolve vazio.
--
-- Mesma solução da highlight_tally: uma função security definer que só
-- devolve agregado. Ela enxerga a tabela, quem chama não.
--
-- Nunca devolve `voter_id` nem contagem por votante. Os três destaques
-- saem por noite, e a contagem que sai é a do JOGADOR — quantos votos
-- recebeu —, nunca a de quem votou.

create or replace function highlight_days(p_limit int default 30)
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
    select id, date from sessions order by date desc limit p_limit
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
    join players   p on p.id = v.player_id
    group by v.session_id, r.date, v.player_id, p.name
  )
  select session_id, played_on, player_id, name, votes
  from contagem
  where pos <= 3
  order by played_on desc, name;
$$;

revoke all on function highlight_days(int) from public;
grant execute on function highlight_days(int) to anon, authenticated;
