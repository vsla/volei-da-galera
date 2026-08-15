-- Vôlei Prainha ZN — quem já votou
-- Rodar no SQL Editor do Supabase, depois de 0008.
--
-- No meio da votação o organizador precisa saber QUEM ainda falta, pra
-- cutucar. Só que a tabela de votos é ilegível pro cliente de propósito
-- (0002/0007): ler ela pra descobrir quem votou entregaria junto EM QUEM
-- cada um votou, que é justamente o que não pode vazar.
--
-- Esta função separa as duas coisas. Devolve o `voter_id` e quantos
-- votos a pessoa deu — nunca o `player_id` votado. Saber que o Neto
-- votou não conta nada sobre o voto dele.

create or replace function highlight_voters(p_session_id uuid)
returns table (voter_id uuid, votes bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.voter_id, count(*)::bigint as votes
  from highlight_votes v
  where v.session_id = p_session_id
  group by v.voter_id;
$$;

revoke all on function highlight_voters(uuid) from public;
grant execute on function highlight_voters(uuid) to anon, authenticated;
