-- 0020 — TROCAR O VOTO SEM PERDER O VOTO
--
-- Sintoma (05/09): quem já tinha votado e tentava trocar levava
--   23505 duplicate key value violates unique constraint
--   "highlight_votes_session_id_voter_id_player_id_key"
--
-- Causa: `castVotes` fazia DELETE e depois INSERT, em duas viagens, e
-- ignorava o resultado do DELETE. Quando a RLS filtra um DELETE ela não
-- dá erro — apaga zero linha e devolve 200. Aí o INSERT reinsere um
-- nome que já estava lá e bate na unique da 0001.
--
-- E tem o lado pior, que não deu as caras mas estava armado: se o
-- DELETE passasse e o INSERT falhasse (rede caindo no meio, que é o
-- normal na praia), a pessoa ficava SEM VOTO NENHUM. Duas viagens sem
-- transação num app onde a votação dura 10 minutos.
--
-- Esta função faz as duas coisas numa transação só. Trocar o voto vira
-- atômico: ou a troca inteira acontece, ou nada muda.
--
-- É security definer pela mesma razão da 0019, e com o mesmo custo já
-- escrito lá: ela acredita no `p_voter_id` que o cliente manda. O teto
-- de privacidade continua sendo o do "clique no seu nome".

create or replace function cast_highlight_votes(
  p_session_id uuid,
  p_voter_id   uuid,
  p_player_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit int;
begin
  -- O limite é da PELADA, não do cliente. A tela já corta em
  -- `votesPerPlayer`, mas quem chama a função direto não passa por ela.
  -- Sessão sobrepõe pelada, mesma ordem do `resolveSettings`.
  select coalesce(
           (s.settings ->> 'votesPerPlayer')::int,
           (p.settings ->> 'votesPerPlayer')::int,
           3
         )
    into v_limit
    from sessions s
    join peladas  p on p.id = s.pelada_id
   where s.id = p_session_id;

  if v_limit is null then
    raise exception 'sessão % não existe', p_session_id;
  end if;

  v_limit := greatest(1, least(v_limit, 10));

  delete from highlight_votes
   where session_id = p_session_id
     and voter_id   = p_voter_id;

  insert into highlight_votes (session_id, voter_id, player_id)
  select p_session_id, p_voter_id, t.pid
    from (
      select distinct on (pid) pid, ord
        from unnest(p_player_ids) with ordinality as u(pid, ord)
       order by pid, ord
    ) t
   -- ninguém vota em si mesmo: o `check` da 0001 recusaria a linha e
   -- derrubaria a troca inteira junto com ela
   where t.pid <> p_voter_id
   order by t.ord
   limit v_limit;
end $$;

revoke all on function cast_highlight_votes(uuid, uuid, uuid[]) from public;
grant execute on function cast_highlight_votes(uuid, uuid, uuid[])
  to anon, authenticated;

notify pgrst, 'reload schema';

-- Confere:
--   select cast_highlight_votes('<sessao>', '<votante>', array['<a>','<b>']::uuid[]);
--   select * from highlight_votes where voter_id = '<votante>';
-- Rodar duas vezes seguidas com a mesma lista tem que dar o mesmo
-- resultado, sem 23505.
