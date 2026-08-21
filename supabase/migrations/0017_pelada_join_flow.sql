-- 0017 — CRIAR E ENTRAR NUMA PELADA, COM A RLS FECHADA
--
-- Conserto de um furo real da 0014, que só aparece na hora de usar:
--
--   new row violates row-level security policy for table "peladas"
--
-- Duas coisas estavam erradas, e as duas são de projeto:
--
--   1. criar pelada era DOIS inserts do cliente (a pelada e a filiação
--      de dono). O segundo passa por `members_insert`, que exige
--      `player_id = current_player_id()` — e o cliente mandava o id do
--      localStorage, que quase nunca é o jogador daquela conta. Resultado:
--      pelada criada e ninguém dono dela;
--
--   2. quem chega no site sem nunca ter jogado não tem `player` nenhum.
--      Não havia como ele existir ANTES de entrar em alguma pelada, e a
--      pelada precisa dele pra ter dono. Ovo e galinha.
--
-- A saída é a mesma da `join_as_guest` (0013): as escritas que dependem
-- uma da outra acontecem juntas, do lado do banco, com o jogador já
-- amarrado à sessão de quem tocou o botão.
--
-- O que continua barrado: sem sessão (nem anônima) nada disso roda, e é
-- de propósito — é o que impede alguém de criar pelada em nome de outro.

-- ─────────────────────────────────────────────────────────────
-- unaccent_safe — "Vôlei" → "Volei" sem depender da extensão unaccent
-- (que exige superuser em alguns projetos). Vem antes de quem usa.
-- ─────────────────────────────────────────────────────────────
create or replace function unaccent_safe(p text)
returns text
language sql
immutable
as $$
  select translate(
    p,
    'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- ensure_player — o jogador desta conta, criando se ainda não existe
-- ─────────────────────────────────────────────────────────────
create or replace function ensure_player(p_name text default null)
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
    raise exception 'sem sessão: habilite o login anônimo ou entre com e-mail';
  end if;

  select id into v_player from players where user_id = v_user limit 1;
  if v_player is not null then
    -- nome novo (a pessoa se cadastrou depois) atualiza o antigo
    if nullif(trim(coalesce(p_name, '')), '') is not null then
      update players set name = trim(p_name) where id = v_player and name is null;
    end if;
    return v_player;
  end if;

  insert into players (name, is_guest, user_id)
  values (nullif(trim(coalesce(p_name, '')), ''), false, v_user)
  returning id into v_player;

  return v_player;
end $$;

-- ─────────────────────────────────────────────────────────────
-- create_pelada — pelada + dono, numa transação só
--
-- O slug sai do nome. "Vôlei da Sexta" é o nome mais provável do
-- planeta, então a colisão é o caso normal, não o excepcional: a função
-- sufixa até achar um livre em vez de devolver erro na cara de quem
-- está criando.
-- ─────────────────────────────────────────────────────────────
create or replace function create_pelada(
  p_name       text,
  p_weekday    int  default null,
  p_owner_name text default null,
  p_settings   jsonb default '{}'::jsonb
)
returns table (id uuid, slug text)
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

  v_player := ensure_player(p_owner_name);

  -- mesma regra do slugify do app, feita aqui pra não depender do cliente
  v_base := regexp_replace(
              regexp_replace(lower(unaccent_safe(trim(p_name))), '[^a-z0-9]+', '-', 'g'),
              '(^-+|-+$)', '', 'g');
  v_base := nullif(left(v_base, 40), '');
  if v_base is null then
    v_base := 'pelada';
  end if;

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

  return query select v_id, v_slug;
end $$;

-- ─────────────────────────────────────────────────────────────
-- join_pelada — entrar por código
-- ─────────────────────────────────────────────────────────────
create or replace function join_pelada(p_code text, p_name text default null)
returns table (id uuid, slug text)
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

  v_player := ensure_player(p_name);

  insert into pelada_members (pelada_id, player_id, role, status)
  values (v_id, v_player, 'player', 'active')
  on conflict (pelada_id, player_id) do update
    set status = 'active';

  return query select v_id, v_slug;
end $$;

grant execute on function ensure_player(text)                        to authenticated;
grant execute on function create_pelada(text, int, text, jsonb)      to authenticated;
grant execute on function join_pelada(text, text)                    to authenticated;
grant execute on function unaccent_safe(text)                        to anon, authenticated;
