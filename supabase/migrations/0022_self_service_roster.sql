-- 0022 — SELF-SERVICE: ELENCO PERSISTENTE + CONVITE INDIVIDUAL
--
-- Um organizador pode preparar a lista da pelada uma vez, sem criar conta
-- em nome de ninguém. A pessoa pode depois reivindicar aquele convite no
-- próprio aparelho. Convidado do dia continua existindo separado disso.

-- Este projeto já teve migrations aplicadas manualmente no SQL Editor.
-- Garante o helper mínimo que este fluxo precisa sem exigir a 0014 inteira.
create or replace function is_pelada_admin(p_pelada uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $
  select exists (
    select 1
      from pelada_members m
     where m.pelada_id = p_pelada
       and m.player_id = current_player_id()
       and m.status = 'active'
       and m.role in ('owner', 'admin')
  );
$;

create table if not exists pelada_invites (
  id          uuid primary key default gen_random_uuid(),
  pelada_id   uuid not null references peladas(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  email       text,
  token       text not null unique,
  created_by  uuid references players(id) on delete set null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  unique (pelada_id, player_id)
);

alter table pelada_invites enable row level security;

drop policy if exists "invites_admin_read" on pelada_invites;
create policy "invites_admin_read"
on pelada_invites for select
to authenticated
using (is_pelada_admin(pelada_id));

create or replace function admin_add_roster_member(
  p_pelada uuid,
  p_name text,
  p_email text default null,
  p_role text default 'player'
)
returns table (player_id uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_token text;
  v_role text := lower(coalesce(p_role, 'player'));
begin
  if not is_pelada_admin(p_pelada) then
    raise exception 'apenas organizadores podem adicionar pessoas';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'informe o nome da pessoa';
  end if;

  if v_role not in ('admin', 'player') then
    raise exception 'papel inválido';
  end if;

  select p.id into v_player
    from pelada_members m
    join players p on p.id = m.player_id
   where m.pelada_id = p_pelada
     and lower(trim(p.name)) = lower(trim(p_name))
   order by case when m.status = 'active' then 0 else 1 end, m.joined_at
   limit 1;

  if v_player is null then
    insert into players (name, is_guest)
    values (trim(p_name), false)
    returning id into v_player;

    insert into pelada_members (pelada_id, player_id, role, status)
    values (p_pelada, v_player, v_role, 'invited');
  else
    update pelada_members
       set role = case when role = 'owner' then role else v_role end,
           status = case when status = 'active' then 'active' else 'invited' end
     where pelada_id = p_pelada
       and player_id = v_player;
  end if;

  v_token := encode(gen_random_bytes(18), 'hex');

  insert into pelada_invites (pelada_id, player_id, email, token, created_by)
  values (
    p_pelada,
    v_player,
    nullif(lower(trim(coalesce(p_email, ''))), ''),
    v_token,
    current_player_id()
  )
  on conflict (pelada_id, player_id) do update
    set email = excluded.email,
        token = excluded.token,
        created_by = excluded.created_by,
        created_at = now(),
        claimed_at = null
  returning pelada_invites.token into v_token;

  return query select v_player, v_token;
end $$;

create or replace function claim_roster_invite(p_token text)
returns table (id uuid, slug text, player_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite pelada_invites%rowtype;
  v_user uuid := auth.uid();
  v_existing uuid;
  v_target uuid;
  v_slug text;
begin
  if v_user is null then
    raise exception 'sem sessão';
  end if;

  select * into v_invite
    from pelada_invites
   where token = lower(trim(p_token))
     and claimed_at is null
   limit 1
   for update;

  if v_invite.id is null then
    return;
  end if;

  select p.id into v_existing
    from players p
   where p.user_id = v_user
   limit 1;

  if v_existing is null then
    update players
       set user_id = v_user,
           is_guest = false
     where players.id = v_invite.player_id
       and user_id is null;

    if found then
      v_target := v_invite.player_id;
    else
      select p.id into v_target from players p where p.user_id = v_user limit 1;
    end if;
  else
    v_target := v_existing;
  end if;

  if v_target is null then
    raise exception 'não foi possível ligar o convite à sua conta';
  end if;

  if v_target <> v_invite.player_id then
    insert into pelada_members (pelada_id, player_id, role, status)
    select v_invite.pelada_id, v_target,
           case when m.role = 'admin' then 'admin' else 'player' end,
           'active'
      from pelada_members m
     where m.pelada_id = v_invite.pelada_id
       and m.player_id = v_invite.player_id
    on conflict (pelada_id, player_id) do update
      set status = 'active',
          role = case
            when pelada_members.role = 'owner' then 'owner'
            when excluded.role = 'admin' then 'admin'
            else pelada_members.role
          end;

    update pelada_members
       set status = 'removed'
     where pelada_id = v_invite.pelada_id
       and player_id = v_invite.player_id;
  else
    update pelada_members
       set status = 'active'
     where pelada_id = v_invite.pelada_id
       and player_id = v_target;
  end if;

  update pelada_invites
     set claimed_at = now()
   where pelada_invites.id = v_invite.id;

  select p.slug into v_slug from peladas p where p.id = v_invite.pelada_id;

  return query select v_invite.pelada_id, v_slug, v_target;
end $$;

grant execute on function admin_add_roster_member(uuid, text, text, text) to authenticated;
grant execute on function claim_roster_invite(text) to authenticated;
