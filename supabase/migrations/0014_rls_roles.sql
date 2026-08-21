-- 0014 — RLS DE VERDADE, COM PAPÉIS
--
-- Esta migration é a NOVA FONTE DA VERDADE das policies (o papel que a
-- 0007 fazia no v1). Ela apaga toda policy das tabelas do jogo e
-- reescreve o estado final. Pode rodar quantas vezes precisar.
--
-- O que muda em relação ao v1: até aqui a RLS era aberta e o PIN barrava
-- só na tela (reasonable.md §9) — decisão consciente enquanto o site era
-- de UMA pelada de amigos. Com peladas de grupos que não se conhecem,
-- "quem abre o DevTools escreve no banco" deixa de ser aceitável.
--
-- ⚠️ PRÉ-REQUISITOS, nesta ordem:
--   1. 0012 e 0013 aplicadas;
--   2. "Anonymous sign-ins" habilitado no painel (Authentication →
--      Providers). Sem isso o convidado fica sem sessão e não consegue
--      nem fazer check-in;
--   3. deploy do app que faz login anônimo no primeiro carregamento.
--
-- ⚠️ E DEPOIS: confira com DOIS aparelhos que a tela ao vivo continua
-- atualizando. Realtime respeita RLS — policy errada aqui não dá erro
-- na tela, ela só para de atualizar, que é o pior sintoma possível.

-- ─────────────────────────────────────────────────────────────
-- Helpers. security definer porque precisam ler pelada_members sem
-- cair na própria policy de pelada_members.
-- ─────────────────────────────────────────────────────────────
create or replace function is_member(p_pelada uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pelada_members m
     where m.pelada_id = p_pelada
       and m.player_id = current_player_id()
       and m.status = 'active'
  );
$$;

create or replace function is_pelada_admin(p_pelada uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pelada_members m
     where m.pelada_id = p_pelada
       and m.player_id = current_player_id()
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  );
$$;

/** A pelada de uma sessão — as policies de matches/votos passam por aqui. */
create or replace function pelada_of_session(p_session uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pelada_id from sessions where id = p_session;
$$;

create or replace function pelada_of_match(p_match uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.pelada_id from matches m join sessions s on s.id = m.session_id
   where m.id = p_match;
$$;

grant execute on function is_member(uuid)          to anon, authenticated;
grant execute on function is_pelada_admin(uuid)    to anon, authenticated;
grant execute on function pelada_of_session(uuid)  to anon, authenticated;
grant execute on function pelada_of_match(uuid)    to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- limpa tudo antes de reescrever
-- ─────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'players', 'peladas', 'pelada_members', 'sessions',
         'session_players', 'matches', 'match_players', 'highlight_votes'
       )
  loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;

  for r in select unnest(array[
        'players', 'peladas', 'pelada_members', 'sessions',
        'session_players', 'matches', 'match_players', 'highlight_votes'
      ]) as t
  loop
    execute format('alter table %I enable row level security', r.t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- LEITURA: aberta.
--
-- O produto é a tela ao vivo, e ela precisa carregar antes de qualquer
-- sessão existir. Nada aqui é segredo: nomes, fila e placar já são
-- públicos na quadra. A exceção é `highlight_votes`, que continua sem
-- select nenhum — voto é privado de verdade (reasonable.md §9).
-- ─────────────────────────────────────────────────────────────
create policy players_read        on players        for select to anon, authenticated using (true);
create policy peladas_read        on peladas        for select to anon, authenticated using (true);
create policy members_read        on pelada_members for select to anon, authenticated using (true);
create policy sessions_read       on sessions       for select to anon, authenticated using (true);
create policy session_players_read on session_players for select to anon, authenticated using (true);
create policy matches_read        on matches        for select to anon, authenticated using (true);
create policy match_players_read  on match_players  for select to anon, authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- ESCRITA
-- ─────────────────────────────────────────────────────────────

-- players: qualquer sessão cria (é assim que entra convidado); editar,
-- só o dono da conta ou um admin de alguma pelada da pessoa.
create policy players_insert on players
  for insert to authenticated with check (true);

create policy players_update on players
  for update to authenticated
  using (
    user_id = auth.uid()
    or id = current_player_id()
    or exists (
      select 1 from pelada_members m
       where m.player_id = players.id and is_pelada_admin(m.pelada_id)
    )
  );

-- peladas: qualquer um cria a sua; editar/apagar é do admin
create policy peladas_insert on peladas
  for insert to authenticated with check (true);
create policy peladas_update on peladas
  for update to authenticated using (is_pelada_admin(id));
create policy peladas_delete on peladas
  for delete to authenticated using (
    exists (select 1 from pelada_members m
             where m.pelada_id = peladas.id
               and m.player_id = current_player_id()
               and m.role = 'owner')
  );

-- membros: entrar é de quem entra (por código/link); mexer nos outros é
-- do admin. Sair da pelada continua sendo direito de quem está nela.
create policy members_insert on pelada_members
  for insert to authenticated
  with check (player_id = current_player_id() or is_pelada_admin(pelada_id));
create policy members_update on pelada_members
  for update to authenticated
  using (player_id = current_player_id() or is_pelada_admin(pelada_id));
create policy members_delete on pelada_members
  for delete to authenticated
  using (player_id = current_player_id() or is_pelada_admin(pelada_id));

-- sessões: abrir a noite é de qualquer membro (o primeiro que chega);
-- encerrar, resetar e configurar é de admin.
create policy sessions_insert on sessions
  for insert to authenticated with check (is_member(pelada_id));
create policy sessions_update on sessions
  for update to authenticated using (is_pelada_admin(pelada_id));

-- check-in: o seu, sempre. O dos outros, só admin.
create policy session_players_write on session_players
  for insert to authenticated
  with check (
    player_id = current_player_id()
    or is_pelada_admin(pelada_of_session(session_id))
  );
create policy session_players_update on session_players
  for update to authenticated
  using (
    player_id = current_player_id()
    or is_pelada_admin(pelada_of_session(session_id))
  );

-- partidas e escalação: admin da pelada (ou quem a pelada liberar —
-- `whoCanManage` é checado na tela; aqui o mínimo é ser membro).
create policy matches_write on matches
  for insert to authenticated with check (is_member(pelada_of_session(session_id)));
create policy matches_update on matches
  for update to authenticated using (is_member(pelada_of_session(session_id)));
create policy matches_delete on matches
  for delete to authenticated using (is_pelada_admin(pelada_of_session(session_id)));

create policy match_players_write on match_players
  for insert to authenticated with check (is_member(pelada_of_match(match_id)));
create policy match_players_update on match_players
  for update to authenticated using (is_member(pelada_of_match(match_id)));
create policy match_players_delete on match_players
  for delete to authenticated using (is_member(pelada_of_match(match_id)));

-- voto: escreve o SEU e só o seu; ninguém lê nada (nem o próprio, que
-- vem pela função). Apagar o próprio voto é como se troca de escolha.
create policy votes_insert on highlight_votes
  for insert to authenticated
  with check (voter_id = current_player_id() and voter_id <> player_id);
create policy votes_delete on highlight_votes
  for delete to authenticated
  using (voter_id = current_player_id() or is_pelada_admin(pelada_of_session(session_id)));

-- `myVotes` precisa ler os próprios votos pra tela reabrir marcada.
-- É a ÚNICA leitura de voto que existe, e ela só enxerga os seus.
create policy votes_read_own on highlight_votes
  for select to authenticated using (voter_id = current_player_id());
