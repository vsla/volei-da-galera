-- Vôlei Prainha ZN — aperta a RLS
-- Rodar no SQL Editor do Supabase, depois de 0001.
--
-- Continua sem service role: a anon key está no bundle e todo mundo
-- consegue lê-la. O que muda:
--   1. ninguém apaga o que não deve (0001 dava DELETE em tudo, com cascade)
--   2. voto de destaque volta a ser privado de fato
-- Ações de organizador seguem barradas na camada de route handler (PIN).

-- ─────────────────────────────────────────────────────────────
-- 1. Fora as policies "open" de 0001
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'sessions', 'session_players',
    'matches', 'match_players', 'highlight_votes'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_open', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Leitura + escrita liberadas, DELETE não
--    (highlight_votes fica de fora — tratada no bloco 4)
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'sessions', 'session_players', 'matches', 'match_players'
  ] loop
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_read', t
    );
    execute format(
      'create policy %I on %I for insert to anon, authenticated with check (true)',
      t || '_insert', t
    );
    execute format(
      'create policy %I on %I for update to anon, authenticated using (true) with check (true)',
      t || '_update', t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. DELETE só onde o jogo precisa: tirar gente da fila e
--    desfazer a escalação de uma partida.
--    sessions/matches/players não se apagam pelo cliente — era
--    por aí que o cascade levava a sexta inteira embora.
-- ─────────────────────────────────────────────────────────────
create policy session_players_delete on session_players
  for delete to anon, authenticated using (true);

create policy match_players_delete on match_players
  for delete to anon, authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- 4. highlight_votes — escreve, não lê
--    Sem policy de select, nem o autor relê o próprio voto. É o
--    preço de não ter identidade: qualquer leitura seria leitura
--    de todo mundo. A contagem sai pela função do bloco 5.
-- ─────────────────────────────────────────────────────────────
create policy highlight_votes_insert on highlight_votes
  for insert to anon, authenticated with check (true);

-- Realtime entrega linha a linha respeitando RLS; sem select,
-- só geraria evento vazio e vazaria o timing do voto.
do $$
begin
  execute 'alter publication supabase_realtime drop table highlight_votes';
exception when undefined_object or undefined_table then null;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Contagem agregada — nunca por votante
-- ─────────────────────────────────────────────────────────────
create or replace function highlight_tally(p_session_id uuid)
returns table (player_id uuid, votes bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.player_id, count(*)::bigint as votes
  from highlight_votes v
  where v.session_id = p_session_id
  group by v.player_id
  order by votes desc, v.player_id;
$$;

revoke all on function highlight_tally(uuid) from public;
grant execute on function highlight_tally(uuid) to anon, authenticated;
