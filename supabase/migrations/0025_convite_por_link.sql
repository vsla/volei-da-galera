-- 0025 — O CONVITE POR LINK VOLTA A FUNCIONAR
--
-- `admin_add_roster_member` e `claim_roster_invite` implementam, desde antes
-- da `0022`, exatamente o modelo de identidade que o app quer agora:
--
--   · todo mundo PODE logar, ninguém PRECISA;
--   · quem é novo entra como um nome na lista, sem conta;
--   · quem cria conta reivindica um nome — e SÓ um que ninguém reivindicou;
--   · quem já reivindicou não reivindica de novo: na semana seguinte a
--     participação migra pro jogador que a pessoa já é;
--   · o organizador é quem gera o link, porque claim livre tem o furo do
--     §9b do `reasonable.md` ("alguém votou a noite inteira como outra
--     pessoa") — e agora, com conta, esse erro seria PERMANENTE.
--
-- A `0022` aposentou as duas quando o app deixou de ter contas, e elas
-- ficaram no banco sem nenhum cliente. Esta migration as desengaveta.
--
-- ⚠️ Isto NÃO é o projeto de RLS. As policies continuam `anon, authenticated`
-- pra tudo. O login passa a garantir QUEM VOCÊ É, não O QUE VOCÊ PODE. É um
-- degrau real, e é só um.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1. O mesmo defeito que a 0024 consertou no `join_pelada`
--
-- As duas devolvem `player_id` como coluna de saída, o que põe esse nome
-- em escopo como variável plpgsql, e as duas fazem `on conflict (pelada_id,
-- player_id)` no corpo — onde só cabe nome de coluna cru. Resultado:
-- `column reference "player_id" is ambiguous`, 42702, na primeira chamada.
--
-- Como na 0024, a saída passa a se chamar `player`. E como na 0024, é
-- `drop` + `create`: o Postgres não renomeia coluna de saída com
-- `create or replace`.
-- ─────────────────────────────────────────────────────────────

drop function if exists admin_add_roster_member(uuid, text, text, text);

create function admin_add_roster_member(
  p_pelada uuid,
  p_name   text,
  p_email  text default null,
  p_role   text default 'player'
)
returns table (player uuid, token text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid;
  v_token  text;
  v_role   text := lower(coalesce(p_role, 'player'));
  v_nome   text := nullif(trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), '');
begin
  -- `is_pelada_admin()` pergunta por `current_player_id()`, que é
  -- `players where user_id = auth.uid()`. Ou seja: só um organizador
  -- LOGADO e com o jogador dele já reivindicado consegue convidar. É de
  -- propósito — é o que separa este caminho do claim livre.
  if not is_pelada_admin(p_pelada) then
    raise exception 'apenas organizadores podem adicionar pessoas';
  end if;

  if v_nome is null then
    raise exception 'informe o nome da pessoa';
  end if;

  if v_role not in ('admin', 'player') then
    raise exception 'papel inválido';
  end if;

  -- Casa sem acento e sem caixa, igual ao `add_member` da 0023. A versão
  -- anterior usava só `lower(trim())`: convidar "Lenin" criava um segundo
  -- jogador ao lado do "Lênin" que a lista da semana já tinha posto ali.
  select p.id into v_player
    from pelada_members m
    join players p on p.id = m.player_id
   where m.pelada_id = p_pelada
     and lower(unaccent_safe(p.name)) = lower(unaccent_safe(v_nome))
   order by case when m.status = 'active' then 0 else 1 end, m.joined_at
   limit 1;

  if v_player is null then
    insert into players (name, is_guest)
    values (v_nome, false)
    returning id into v_player;

    insert into pelada_members (pelada_id, player_id, role, status)
    values (p_pelada, v_player, v_role, 'invited');
  else
    update pelada_members
       set role   = case when role = 'owner' then role else v_role end,
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
  on conflict on constraint pelada_invites_pelada_id_player_id_key do update
    set email      = excluded.email,
        token      = excluded.token,
        created_by = excluded.created_by,
        created_at = now(),
        claimed_at = null
  returning pelada_invites.token into v_token;

  return query select v_player, v_token;
end $$;

drop function if exists claim_roster_invite(text);

create function claim_roster_invite(p_token text)
returns table (id uuid, slug text, player uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite   pelada_invites%rowtype;
  v_user     uuid := auth.uid();
  v_existing uuid;
  v_target   uuid;
  v_slug     text;
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
    return;  -- token inexistente ou já usado: zero linhas, a tela avisa
  end if;

  select p.id into v_existing from players p where p.user_id = v_user limit 1;

  if v_existing is null then
    -- Primeiro login desta pessoa. `user_id is null` é a trava que importa:
    -- reivindicar nome que já tem dono é justamente o que não pode.
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
    -- A pessoa JÁ tinha conta e já era um jogador. O nome que o organizador
    -- pôs na lista esta semana é um placeholder: a participação migra pro
    -- jogador de verdade, e o placeholder sai da tela.
    insert into pelada_members (pelada_id, player_id, role, status)
    select v_invite.pelada_id, v_target,
           case when m.role = 'admin' then 'admin' else 'player' end,
           'active'
      from pelada_members m
     where m.pelada_id = v_invite.pelada_id
       and m.player_id = v_invite.player_id
    on conflict on constraint pelada_members_pkey do update
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

-- ─────────────────────────────────────────────────────────────
-- 2. A lista da semana não derruba convite pendente
--
-- `sync_members` marca `removed` quem não está na lista colada, poupando
-- `owner` e `admin`. `invited` caía nessa: o organizador convidava alguém
-- na quarta, colava a lista na sexta, e o convite sumia da tela antes de a
-- pessoa clicar no link.
--
-- O convite é do organizador, não da lista — e quem clica no link entra
-- como `active` de qualquer jeito. Poupar é o comportamento certo.
-- ─────────────────────────────────────────────────────────────

create or replace function sync_members(p_pelada uuid, p_names text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saem   integer;
  v_chaves text[];
begin
  if not exists (select 1 from peladas where id = p_pelada) then
    raise exception 'essa pelada não existe';
  end if;

  select array_agg(lower(unaccent_safe(trim(regexp_replace(n, '\s+', ' ', 'g')))))
    into v_chaves
    from unnest(coalesce(p_names, '{}'::text[])) as n
   where nullif(trim(n), '') is not null;

  if v_chaves is null or cardinality(v_chaves) = 0 then
    raise exception 'a lista está vazia — nada foi sincronizado';
  end if;

  update pelada_members m
     set status = 'removed'
    from players p
   where p.id = m.player_id
     and m.pelada_id = p_pelada
     and coalesce(m.status, 'active') not in ('removed', 'invited')
     and coalesce(m.role, 'player') not in ('owner', 'admin')
     and not (lower(unaccent_safe(p.name)) = any (v_chaves));

  get diagnostics v_saem = row_count;

  return v_saem;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. Grants — o `drop` derruba junto
-- ─────────────────────────────────────────────────────────────

grant execute on function admin_add_roster_member(uuid, text, text, text) to authenticated;
grant execute on function claim_roster_invite(text)                       to authenticated;
grant execute on function sync_members(uuid, text[])                      to anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────
-- Conferência.
--
--   select proname, pg_get_function_result(oid) from pg_proc
--    where proname in ('admin_add_roster_member','claim_roster_invite');
--   -- esperado: `player`, nunca `player_id`
--
-- ⚠️ PASSO MANUAL, uma vez por pelada: o organizador precisa ter conta E
-- ter o jogador dele reivindicado, senão `is_pelada_admin()` devolve false
-- e o convite é recusado pro dono da pelada inclusive. Ver `0026`.
-- ─────────────────────────────────────────────────────────────
