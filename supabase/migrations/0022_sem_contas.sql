-- 0022 — FORA AS CONTAS: identidade volta a ser um toque no nome
--
-- Desfaz a decisão central da 0013/0014. Vale dizer por quê, porque a
-- 0014 não estava errada em teoria — ela estava errada na praia:
--
--   • ela exige `auth.uid()` pra QUALQUER escrita, e o convidado só tem
--     uid por login anônimo. Login anônimo é um toggle no painel do
--     Supabase, e enquanto ele esteve desligado o site inteiro ficou
--     somente-leitura pra todo mundo, sem erro legível na tela;
--   • o `claim_player` amarrava o nome ao primeiro aparelho que tocasse
--     nele. Quem trocava de celular (ou limpava o navegador) virava
--     "esse nome já está sendo usado em outro aparelho" — acusação
--     falsa, e sem saída dentro do app;
--   • nada disso comprava segurança de verdade: a anon key está no
--     bundle, é pública por natureza, e o site é o link que roda no
--     grupo do WhatsApp.
--
-- Então volta a regra do v1, que rodou uma temporada inteira sem
-- incidente (`reasonable.md` §9): quem tem o link escreve; o PIN do
-- organizador barra na tela, não no banco. É uma pelada de amigos, e o
-- pior caso é alguém fazer check-in no lugar de outro — que se conserta
-- com um toque.
--
-- O QUE CONTINUA PROTEGIDO: o voto do Destaque. Ninguém lê a tabela de
-- votos, nem o próprio voto — isso passa por função agregada. Era a
-- única coisa de fato secreta e continua sendo.
--
-- Idempotente e autoritativa: esta é a nova fonte da verdade das
-- policies. Pode rodar quantas vezes precisar.
--
-- ⚠️  Depois de rodar, "Anonymous sign-ins" no painel deixa de importar:
--     o app não faz mais login nenhum.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. Apaga toda policy das tabelas do jogo (as da 0014 inclusive)
-- ─────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in (
         'players', 'peladas', 'pelada_members', 'sessions',
         'session_players', 'matches', 'match_players', 'highlight_votes'
       )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;

  -- RLS ligada, senão policy nenhuma vale
  for r in select unnest(array[
        'players', 'peladas', 'pelada_members', 'sessions',
        'session_players', 'matches', 'match_players', 'highlight_votes'
      ]) as t
  loop
    execute format('alter table public.%I enable row level security', r.t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2. Fora as funções que dependiam de conta.
--    Vêm DEPOIS das policies porque as policies dependiam delas.
-- ─────────────────────────────────────────────────────────────
drop function if exists is_member(uuid);
drop function if exists is_pelada_admin(uuid);
drop function if exists current_player_id();
drop function if exists claim_player(uuid);
drop function if exists ensure_player(text);
drop function if exists create_pelada(text, int, text, jsonb);
drop function if exists join_pelada(text, text);
drop function if exists join_as_guest(uuid, text);

-- ─────────────────────────────────────────────────────────────
-- 3. Ler, inserir e atualizar: liberado, como no v1.
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'peladas', 'pelada_members', 'sessions',
    'session_players', 'matches', 'match_players'
  ] loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for insert to anon, authenticated with check (true)',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to anon, authenticated using (true) with check (true)',
      t || '_update', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Apagar: só onde o app precisa.
--    `sessions` e `players` NUNCA — é ali que o cascade faz estrago
--    (a noite inteira, ou o histórico de todo mundo, num toque).
-- ─────────────────────────────────────────────────────────────
create policy session_players_delete on session_players
  for delete to anon, authenticated using (true);
create policy match_players_delete on match_players
  for delete to anon, authenticated using (true);
-- matches: reset da noite e limpeza de rascunho/órfã
create policy matches_delete on matches
  for delete to anon, authenticated using (true);
-- membros: o organizador tira quem saiu do grupo
create policy members_delete on pelada_members
  for delete to anon, authenticated using (true);

-- peladas: apagar SÓ a pelada descartável do smoke test.
--
-- Apagar pelada leva a noite, as partidas e o histórico de todos os
-- membros por cascade, e nenhuma tela do app faz isso — logo o cliente
-- não precisa do direito. O `npm run smoke` precisa, pra limpar a
-- pelada que ele mesmo cria: o escopo é o slug dela e nada mais.
create policy peladas_delete_smoke on peladas
  for delete to anon, authenticated using (slug like 'smoke-test%');

-- ─────────────────────────────────────────────────────────────
-- 5. Voto: escreve e apaga, NUNCA lê.
--
-- É a única coisa que a 0014 protegia e que continua protegida: select
-- aberto em `highlight_votes` deixaria qualquer um cruzar voto com
-- votante no DevTools.
--
-- Quem relê o próprio voto é a `highlight_votes_by` da 0019 — security
-- definer, devolve só as linhas daquele votante, e não exige conta. Ela
-- NÃO é recriada aqui: a 0019 já a deixou pronta e esta migration não a
-- derruba. O que cai no passo 2 é a policy `votes_read_own` da 0018, que
-- dependia de `current_player_id()` — a 0019 existe exatamente porque
-- aquele caminho exigia conta.
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
-- 6. Criar pelada e entrar por código, sem conta.
--
-- Continuam sendo FUNÇÃO (e não inserts do cliente) por um motivo que
-- não tem a ver com RLS: as duas escritas dependem uma da outra — a
-- pelada precisa de dono e o dono precisa da pelada. Separadas, uma
-- falha deixa pelada sem organizador, que é irrecuperável pela tela.
--
-- O jogador agora vem do aparelho (`p_player`, o localStorage) em vez
-- de `auth.uid()`. Nulo, ou apontando pra jogador que não existe mais
-- (aparelho novo), cria um.
-- ─────────────────────────────────────────────────────────────
create or replace function ensure_player(
  p_name   text default null,
  p_player uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_name   text := nullif(trim(coalesce(p_name, '')), '');
begin
  if p_player is not null then
    select id into v_player from players where id = p_player;
  end if;

  if v_player is not null then
    -- nome novo (a pessoa se apresentou depois) preenche o que faltava
    if v_name is not null then
      update players set name = v_name where id = v_player and name is null;
    end if;
    return v_player;
  end if;

  -- Sem nome não dá pra criar jogador: `players.name` é NOT NULL, e o
  -- erro cru (23502) chegava na tela como "Failing row contains…".
  -- Acontece de verdade quando o aparelho tem um id antigo no
  -- localStorage e aquele jogador não existe mais no banco (um reset da
  -- lista, por exemplo) — a tela precisa voltar a pedir o nome.
  if v_name is null then
    raise exception 'diga seu nome';
  end if;

  insert into players (name, is_guest)
  values (v_name, false)
  returning id into v_player;

  return v_player;
end $$;

create or replace function create_pelada(
  p_name       text,
  p_weekday    int   default null,
  p_owner_name text  default null,
  p_settings   jsonb default '{}'::jsonb,
  p_player     uuid  default null
)
-- `player` e não `player_id`: o nome da coluna de saída vira variável
-- plpgsql, e `on conflict (pelada_id, player_id)` ficaria ambíguo
returns table (id uuid, slug text, player uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_base   text;
  v_slug   text;
  v_id     uuid;
  v_try    int := 0;
begin
  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'a pelada precisa de um nome';
  end if;

  v_player := ensure_player(p_owner_name, p_player);

  -- mesma regra do slugify do app, feita aqui pra não depender do cliente
  v_base := regexp_replace(
              regexp_replace(lower(unaccent_safe(trim(p_name))), '[^a-z0-9]+', '-', 'g'),
              '(^-+|-+$)', '', 'g');
  v_base := nullif(left(v_base, 40), '');
  if v_base is null then
    v_base := 'pelada';
  end if;

  -- "Vôlei da Sexta" é o nome mais provável do planeta: colisão é o caso
  -- normal, então sufixa até achar livre em vez de dar erro na cara
  loop
    v_slug := case when v_try = 0 then v_base else v_base || '-' || (v_try + 1) end;
    exit when not exists (select 1 from peladas p where p.slug = v_slug);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'não achei um endereço livre pra essa pelada';
    end if;
  end loop;

  insert into peladas (slug, name, weekday, join_code, settings, created_by)
  values (
    v_slug,
    trim(p_name),
    p_weekday,
    -- código curto, sem 0/O e 1/I: é digitado na praia, no escuro
    (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                              1 + floor(random() * 32)::int, 1), '')
       from generate_series(1, 6)),
    coalesce(p_settings, '{}'::jsonb),
    v_player
  )
  returning peladas.id into v_id;

  insert into pelada_members (pelada_id, player_id, role)
  values (v_id, v_player, 'owner');

  return query select v_id, v_slug, v_player;
end $$;

create or replace function join_pelada(
  p_code   text,
  p_name   text default null,
  p_player uuid default null
)
-- `player` e não `player_id`: o nome da coluna de saída vira variável
-- plpgsql, e `on conflict (pelada_id, player_id)` ficaria ambíguo
returns table (id uuid, slug text, player uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_id     uuid;
  v_slug   text;
begin
  select p.id, p.slug into v_id, v_slug
    from peladas p
   where p.join_code = upper(trim(p_code))
   limit 1;

  if v_id is null then
    return;  -- código não existe: zero linhas, a tela avisa
  end if;

  v_player := ensure_player(p_name, p_player);

  insert into pelada_members (pelada_id, player_id, role, status)
  values (v_id, v_player, 'player', 'active')
  on conflict (pelada_id, player_id) do update
    set status = 'active';

  return query select v_id, v_slug, v_player;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Convidado: nasce jogador e membro no mesmo toque.
-- ─────────────────────────────────────────────────────────────
create or replace function join_as_guest(p_pelada uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_player uuid;
begin
  insert into players (name, is_guest)
  values (nullif(trim(p_name), ''), true)
  returning id into v_player;

  insert into pelada_members (pelada_id, player_id, role)
  values (p_pelada, v_player, 'guest')
  on conflict (pelada_id, player_id) do nothing;

  return v_player;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Agora tudo roda como `anon` — sem grant, PostgREST devolve 404
-- ─────────────────────────────────────────────────────────────
grant execute on function ensure_player(text, uuid)                    to anon, authenticated;
grant execute on function create_pelada(text, int, text, jsonb, uuid)  to anon, authenticated;
grant execute on function join_pelada(text, text, uuid)                to anon, authenticated;
grant execute on function join_as_guest(uuid, text)                    to anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────
-- Conferência. Esperado:
--   · nenhuma linha com cmd = 'DELETE' em sessions ou players
--   · nenhuma linha com cmd = 'SELECT' em highlight_votes
--   · nenhuma policy restrita a `{authenticated}`
-- ─────────────────────────────────────────────────────────────
select tablename, cmd, roles::text
  from pg_policies
 where schemaname = 'public'
   and tablename in ('players', 'peladas', 'pelada_members', 'sessions',
                     'session_players', 'matches', 'match_players',
                     'highlight_votes')
 order by tablename, cmd;
