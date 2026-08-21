-- 0013 — CONTAS E FOTO
--
-- Playtest 01: "login, cadastro, colocar foto para aparecer no destaque
-- do dia". Até aqui identidade era um id no localStorage — o suficiente
-- pra uma pelada de amigos, insuficiente pra várias.
--
-- A decisão que sustenta o resto: `players` (a pessoa na quadra) NÃO é
-- `profiles` (a conta). Convidado sem cadastro continua existindo e
-- continua entrando em um toque; quem cria conta REIVINDICA o player
-- que já tinha — senão o histórico de todo mundo zeraria no dia do
-- login, que é a pior coisa que um app de pelada pode fazer.
--
-- ⚠️ ANTES DE RODAR: habilite "Anonymous sign-ins" no painel do
-- Supabase (Authentication → Providers). É o que dá uma sessão pro
-- convidado — e sem sessão a 0014 tranca a escrita pra todo mundo.

create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table players add column if not exists user_id uuid references auth.users(id) on delete set null;
create unique index if not exists players_user_idx on players (user_id) where user_id is not null;

-- ─────────────────────────────────────────────────────────────
-- perfil nasce junto com a conta
-- ─────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- claim_player — "você é o João da lista?"
--
-- Só reivindica quem ainda não tem dono. Sem isso, qualquer conta nova
-- poderia se apossar do histórico (e da nota) de outra pessoa.
-- ─────────────────────────────────────────────────────────────
create or replace function claim_player(p_player uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then
    return false;
  end if;

  -- já tem um player meu? então nada a fazer
  if exists (select 1 from players where user_id = v_user) then
    return exists (select 1 from players where user_id = v_user and id = p_player);
  end if;

  update players
     set user_id = v_user,
         is_guest = false
   where id = p_player
     and user_id is null;

  return found;
end $$;

-- ─────────────────────────────────────────────────────────────
-- join_as_guest — "sou convidado", em um toque
--
-- Por que é uma função e não dois inserts do cliente: com a RLS da 0014,
-- entrar na pelada exige ser `current_player_id()` — e o convidado
-- acabou de nascer, então ele ainda não é ninguém. As duas escritas
-- (criar o player e virar membro) precisam acontecer juntas, do lado do
-- banco, com o player já amarrado à sessão anônima de quem tocou.
--
-- É o que mantém a promessa do RESUMO.md ("login não pode custar mais
-- que um toque") de pé mesmo com a RLS fechada.
-- ─────────────────────────────────────────────────────────────
create or replace function join_as_guest(p_pelada uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_player uuid;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  -- já tem um jogador nesta conta? usa ele, não cria outro
  select id into v_player from players where user_id = v_user limit 1;

  if v_player is null then
    insert into players (name, is_guest, user_id)
    values (nullif(trim(p_name), ''), true, v_user)
    returning id into v_player;
  end if;

  insert into pelada_members (pelada_id, player_id, role)
  values (p_pelada, v_player, 'guest')
  on conflict (pelada_id, player_id) do nothing;

  return v_player;
end $$;

grant execute on function join_as_guest(uuid, text) to authenticated;

/** O player desta conta — usado pelas policies da 0014. */
create or replace function current_player_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from players where user_id = auth.uid() limit 1;
$$;

grant execute on function claim_player(uuid)  to authenticated;
grant execute on function current_player_id() to anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- foto — bucket público, escrita só na própria pasta
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

do $$
begin
  -- leitura: pública (a foto aparece no card de destaque, que é pra postar)
  drop policy if exists "avatars_read" on storage.objects;
  create policy "avatars_read" on storage.objects
    for select to anon, authenticated using (bucket_id = 'avatars');

  -- escrita: só na pasta com o id da própria conta
  drop policy if exists "avatars_write" on storage.objects;
  create policy "avatars_write" on storage.objects
    for insert to authenticated
    with check (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );

  drop policy if exists "avatars_update" on storage.objects;
  create policy "avatars_update" on storage.objects
    for update to authenticated
    using (
      bucket_id = 'avatars'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
end $$;

-- profiles: cada um lê todos (o nome aparece na lista) e escreve o seu
alter table profiles enable row level security;

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles
  for select to anon, authenticated using (true);

drop policy if exists profiles_write on profiles;
create policy profiles_write on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
  for insert to authenticated with check (id = auth.uid());
