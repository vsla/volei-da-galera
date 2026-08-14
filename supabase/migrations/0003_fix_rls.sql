-- Conserta a RLS. Rodar no SQL Editor do Supabase.
--
-- Diagnóstico (confirmado contra o banco):
--   • INSERT em highlight_votes → 42501, sem policy nenhuma
--   • DELETE em sessions → 200 mas não apaga nada (silencioso, que é
--     como a RLS nega DELETE: sem policy USING, zero linhas casam)
--
-- Ou seja, as policies que existem hoje cobrem SELECT/INSERT/UPDATE em
-- algumas tabelas, mas não DELETE em nenhuma e nada em highlight_votes.
-- Aqui a gente apaga tudo que existir e recria explícito, por comando —
-- é mais verboso que FOR ALL, mas não deixa dúvida sobre o que ficou.

do $$
declare
  t text;
  pol record;
begin
  foreach t in array array[
    'players', 'sessions', 'session_players',
    'matches', 'match_players', 'highlight_votes'
  ] loop
    execute format('alter table %I enable row level security', t);

    -- limpa qualquer policy anterior, venha da migration ou da UI
    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;

    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_sel', t);
    execute format(
      'create policy %I on %I for insert to anon, authenticated with check (true)',
      t || '_ins', t);
    execute format(
      'create policy %I on %I for update to anon, authenticated using (true) with check (true)',
      t || '_upd', t);
    execute format(
      'create policy %I on %I for delete to anon, authenticated using (true)',
      t || '_del', t);
  end loop;
end $$;

-- Confere o resultado: 24 linhas (6 tabelas × 4 comandos).
select tablename, cmd, policyname
from pg_policies
where schemaname = 'public'
  and tablename in ('players','sessions','session_players','matches','match_players','highlight_votes')
order by tablename, cmd;
