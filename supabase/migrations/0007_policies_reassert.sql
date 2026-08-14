-- Vôlei Prainha ZN — reafirma as policies
-- Rodar no SQL Editor do Supabase, depois de 0006.
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- Verificando o banco depois de rodar 0001..0006, o `select` em
-- highlight_votes voltou a funcionar pro anon — ou seja, a proteção da
-- 0002 não estava mais de pé. A causa provável é a 0001 ter rodado de
-- novo (ou fora de ordem): ela recria `<tabela>_open` com `for all` em
-- todas as tabelas, o que reabre a leitura dos votos E devolve o
-- `delete` em sessions e players — este último é o que dói, porque o
-- cascade leva a noite inteira junto.
--
-- Diferente das outras, esta migration é IDEMPOTENTE e AUTORITATIVA:
-- ela apaga toda policy conhecida e reescreve o estado final desejado.
-- Rodar duas vezes não faz diferença. Se algum dia o banco parecer
-- estranho, rode esta de novo — é a fonte da verdade das policies.

-- ─────────────────────────────────────────────────────────────
-- 1. Limpa tudo o que veio antes (inclusive os `_open` da 0001)
-- ─────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('players', 'sessions', 'session_players',
                        'matches', 'match_players', 'highlight_votes')
  loop
    execute format('drop policy %I on %I', r.policyname, r.tablename);
  end loop;
end $$;

-- RLS tem que estar ligada, senão policy nenhuma vale
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'sessions', 'session_players',
    'matches', 'match_players', 'highlight_votes'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Ler, inserir e atualizar: liberado
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'sessions', 'session_players', 'matches', 'match_players'
  ] loop
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_read', t);
    execute format(
      'create policy %I on %I for insert to anon, authenticated with check (true)',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update to anon, authenticated using (true) with check (true)',
      t || '_update', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Apagar: só onde o app precisa
--    sessions e players NUNCA — é ali que o cascade faz estrago
-- ─────────────────────────────────────────────────────────────
create policy session_players_delete on session_players
  for delete to anon, authenticated using (true);

create policy match_players_delete on match_players
  for delete to anon, authenticated using (true);

-- matches: precisa pro reset da noite e pra limpar rascunho/órfã
create policy matches_delete on matches
  for delete to anon, authenticated using (true);

-- ─────────────────────────────────────────────────────────────
-- 4. Votos: escreve e apaga, NUNCA lê
--    A contagem sai por highlight_tally(), que só devolve agregado.
-- ─────────────────────────────────────────────────────────────
create policy highlight_votes_insert on highlight_votes
  for insert to anon, authenticated with check (true);

create policy highlight_votes_delete on highlight_votes
  for delete to anon, authenticated using (true);

-- realtime em highlight_votes vazaria o timing do voto
do $$
begin
  execute 'alter publication supabase_realtime drop table highlight_votes';
exception when undefined_object or undefined_table then null;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 5. Confere: rode isto depois e leia o resultado
-- ─────────────────────────────────────────────────────────────
-- select tablename, policyname, cmd
-- from pg_policies where schemaname = 'public' order by tablename, cmd;
--
-- Esperado: nenhuma linha com cmd = 'DELETE' em sessions ou players,
-- e nenhuma linha com cmd = 'SELECT' em highlight_votes.
