-- 0026 — GESTÃO DE GRUPO: arquivar, sair, transferir, remover de vez
--
-- O app virou self-service: qualquer um cria conta, cria um grupo e chama
-- os amigos. Isso abre três buracos que não existiam quando o banco tinha
-- uma pelada só, a Prainha, e um dono, você:
--
--   1. grupo criado por engano não tinha como sumir da tela de ninguém;
--   2. quem entrou no grupo errado não tinha como sair;
--   3. remover alguém marcava `removed` e pronto — o `players` ficava lá
--      pra sempre, mesmo quando era um nome digitado errado, sem conta e
--      sem uma única partida.
--
-- E um quarto, que é de fluxo: `join_pelada` ESCREVE. Entrar por código
-- criava um jogador novo antes de a pessoa dizer quem é — que é
-- exatamente o "já me pergunta qual usuário eu sou" ao contrário. Daí a
-- `peek_pelada`: resolve o código sem tocar em nada, e a tela pergunta
-- primeiro.
--
-- SOBRE PERMISSÃO: a 0022 trocou RLS por confiança entre amigos e isto
-- não desfaz essa decisão. Mas as funções daqui apagam coisa, e apagar é
-- o único lugar onde "qualquer um pode" não serve. Então elas checam
-- `is_pelada_admin()` / `is_pelada_owner()` — que dependem de sessão, e
-- por isso são todas de tela do app, nunca da web anônima.

alter table peladas add column if not exists archived_at timestamptz;

comment on column peladas.archived_at is
  'Grupo arquivado: some da lista, ninguém entra mais, nada é apagado.';

-- ─────────────────────────────────────────────────────────────
-- Quem é dono
-- ─────────────────────────────────────────────────────────────

create or replace function is_pelada_owner(p_pelada uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
      from pelada_members m
     where m.pelada_id = p_pelada
       and m.player_id = current_player_id()
       and m.status = 'active'
       and m.role = 'owner'
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- Espiar o grupo pelo código, SEM entrar
-- ─────────────────────────────────────────────────────────────
--
-- `join_pelada` continua existindo e continua sendo quem escreve. Esta
-- aqui é o passo antes: mostra no que a pessoa está prestes a entrar, e
-- deixa a tela perguntar "você já está nessa lista?" antes de criar
-- jogador nenhum.

create or replace function peek_pelada(p_code text)
returns table (id uuid, slug text, name text, members integer, archived boolean)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id,
         p.slug,
         p.name,
         (select count(*)::int
            from pelada_members m
           where m.pelada_id = p.id
             and m.status <> 'removed'),
         p.archived_at is not null
    from peladas p
   where p.join_code = upper(trim(p_code))
   limit 1;
$$;

-- ─────────────────────────────────────────────────────────────
-- Os nomes daquele grupo que ainda não têm dono
-- ─────────────────────────────────────────────────────────────
--
-- A tela antiga (`quem-sou`) perguntava isto no LOGIN, e pior: lendo
-- `peladas` inteira e pegando a primeira. Num app self-service isso
-- significa oferecer a lista de estranhos pra quem acabou de se
-- cadastrar. A pergunta é do grupo, não da conta — então a função é por
-- pelada, e só devolve quem ninguém reivindicou.
--
-- Convidado fica de fora: convidado não é conta, é um nome de uma noite.

create or replace function claimable_members(p_pelada uuid)
returns table (player_id uuid, name text, rating numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.name, m.rating
    from pelada_members m
    join players p on p.id = m.player_id
   where m.pelada_id = p_pelada
     and m.status in ('active', 'invited')
     and p.user_id is null
     and p.is_guest = false
     and p.name is not null
   order by p.name;
$$;

-- ─────────────────────────────────────────────────────────────
-- Entrar por código: agora recusa grupo arquivado
-- ─────────────────────────────────────────────────────────────

create or replace function join_pelada(
  p_code   text,
  p_name   text default null,
  p_player uuid default null
)
returns table (id uuid, slug text, player uuid)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_player uuid;
  v_id     uuid;
  v_slug   text;
  v_arq    timestamptz;
begin
  select p.id, p.slug, p.archived_at into v_id, v_slug, v_arq
    from peladas p
   where p.join_code = upper(trim(p_code))
   limit 1;

  if v_id is null then
    return;
  end if;

  if v_arq is not null then
    raise exception 'esse grupo foi arquivado por quem organiza';
  end if;

  v_player := ensure_player(p_name, p_player);

  insert into pelada_members (pelada_id, player_id, role, status)
  values (v_id, v_player, 'player', 'active')
  on conflict (pelada_id, player_id) do update
    set status = 'active';

  return query select v_id, v_slug, v_player;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Arquivar / desarquivar
-- ─────────────────────────────────────────────────────────────
--
-- NÃO apaga. Um grupo com três meses de sexta guarda nota, histórico e
-- destaques de gente que nem usa mais o app — e apagar isso pra limpar
-- uma tela é troca ruim. Arquivar tira da lista de todo mundo, tranca a
-- porta (`join_pelada` acima recusa) e é reversível.
--
-- Só o dono. Admin organiza a pelada; sumir com ela é outro nível.

create or replace function archive_pelada(p_pelada uuid, p_on boolean default true)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_pelada_owner(p_pelada) then
    raise exception 'só quem é dono do grupo pode arquivar';
  end if;

  update peladas
     set archived_at = case when p_on then now() else null end
   where id = p_pelada;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Passar o grupo pra outra pessoa
-- ─────────────────────────────────────────────────────────────
--
-- Existe por causa do `leave_pelada` logo abaixo: o dono não pode sair
-- de um grupo sem dono, senão ninguém mais organiza nem arquiva. Quem
-- recebe vira `owner`, quem passa vira `admin` — continua organizando,
-- só não manda mais no grupo.

create or replace function transfer_pelada_owner(p_pelada uuid, p_player uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_eu uuid := current_player_id();
begin
  if not is_pelada_owner(p_pelada) then
    raise exception 'só quem é dono do grupo pode passar a bola';
  end if;

  if not exists (
    select 1 from pelada_members
     where pelada_id = p_pelada and player_id = p_player and status = 'active'
  ) then
    raise exception 'essa pessoa não está no grupo';
  end if;

  if p_player = v_eu then
    return;
  end if;

  update pelada_members set role = 'owner'
   where pelada_id = p_pelada and player_id = p_player;

  update pelada_members set role = 'admin'
   where pelada_id = p_pelada and player_id = v_eu;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Sair do grupo por conta própria
-- ─────────────────────────────────────────────────────────────
--
-- `removed`, nunca delete: o nome continua nas partidas de quem ficou.
-- Voltar é entrar pelo código de novo, e aí o `on conflict` do
-- `join_pelada` reativa a mesma filiação, com a mesma nota.

create or replace function leave_pelada(p_pelada uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_eu uuid := current_player_id();
begin
  if v_eu is null then
    raise exception 'sem sessão';
  end if;

  if is_pelada_owner(p_pelada) then
    raise exception 'você é dono desse grupo — passe pra outra pessoa antes de sair';
  end if;

  update pelada_members
     set status = 'removed'
   where pelada_id = p_pelada and player_id = v_eu;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Remover alguém — e, quando dá, apagar de vez
-- ─────────────────────────────────────────────────────────────
--
-- Duas coisas diferentes com o mesmo botão, e a diferença é do banco,
-- não da tela:
--
--   `removed`  — a pessoa jogou. O nome dela está em `match_players`, e
--                apagar levaria junto o histórico de quem jogou CONTRA
--                ela. É o mesmo motivo do `sync_members`.
--
--   `deleted`  — nome digitado errado, convidado de uma noite que nem
--                chegou, alguém que entrou no grupo trocado. Sem conta,
--                sem partida, sem voto, e em nenhum outro grupo: não há
--                nada pra preservar, e deixar isso na lista pra sempre é
--                sujeira que só cresce.
--
-- Devolve qual dos dois aconteceu, porque a tela precisa dizer a
-- verdade ("saiu da lista" ≠ "apagado de vez").

create or replace function remove_pelada_member(p_pelada uuid, p_player uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_apagavel boolean;
begin
  if not is_pelada_admin(p_pelada) then
    raise exception 'só quem organiza pode remover alguém do grupo';
  end if;

  if exists (
    select 1 from pelada_members
     where pelada_id = p_pelada and player_id = p_player and role = 'owner'
  ) then
    raise exception 'o dono do grupo não pode ser removido';
  end if;

  select
    -- sem conta ligada
    not exists (select 1 from players where id = p_player and user_id is not null)
    -- nunca entrou em quadra
    and not exists (select 1 from match_players where player_id = p_player)
    -- nunca foi marcado numa noite
    and not exists (select 1 from session_players where player_id = p_player)
    -- não votou nem foi votado
    and not exists (
      select 1 from highlight_votes
       where voter_id = p_player or player_id = p_player
    )
    -- não é lembrança de nenhum outro grupo
    and not exists (
      select 1 from pelada_members
       where player_id = p_player and pelada_id <> p_pelada
    )
    and not exists (select 1 from peladas where created_by = p_player)
  into v_apagavel;

  if v_apagavel then
    delete from pelada_invites where player_id = p_player;
    delete from pelada_members where player_id = p_player;
    delete from players where id = p_player;
    return 'deleted';
  end if;

  update pelada_members
     set status = 'removed'
   where pelada_id = p_pelada and player_id = p_player;

  return 'removed';
end $$;

-- ─────────────────────────────────────────────────────────────
-- Trocar o código de convite
-- ─────────────────────────────────────────────────────────────
--
-- O código vive num grupo de WhatsApp, e grupo de WhatsApp vaza. Trocar
-- é a única forma de fechar a porta sem arquivar o grupo inteiro.
-- Mesmo alfabeto do `create_pelada`: sem 0/O e 1/I, porque é digitado na
-- praia, no escuro.

create or replace function regenerate_join_code(p_pelada uuid)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_code text;
begin
  if not is_pelada_admin(p_pelada) then
    raise exception 'só quem organiza pode trocar o código';
  end if;

  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                             1 + floor(random() * 32)::int, 1), '')
      into v_code
      from generate_series(1, 6);
    exit when not exists (select 1 from peladas where join_code = v_code);
  end loop;

  update peladas set join_code = v_code where id = p_pelada;
  return v_code;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Renomear o grupo / trocar o dia
-- ─────────────────────────────────────────────────────────────
--
-- O `slug` NÃO muda junto, de propósito: ele está no link que já caiu no
-- grupo do WhatsApp, e link que morre porque alguém arrumou um acento é
-- pior que um endereço desatualizado.

create or replace function rename_pelada(
  p_pelada  uuid,
  p_name    text,
  p_weekday integer default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_pelada_admin(p_pelada) then
    raise exception 'só quem organiza pode mudar o grupo';
  end if;

  if nullif(trim(coalesce(p_name, '')), '') is null then
    raise exception 'o grupo precisa de um nome';
  end if;

  update peladas
     set name    = trim(p_name),
         weekday = p_weekday
   where id = p_pelada;
end $$;

grant execute on function is_pelada_owner(uuid)            to anon, authenticated;
grant execute on function peek_pelada(text)                to anon, authenticated;
grant execute on function claimable_members(uuid)          to anon, authenticated;
grant execute on function archive_pelada(uuid, boolean)    to anon, authenticated;
grant execute on function transfer_pelada_owner(uuid,uuid) to anon, authenticated;
grant execute on function leave_pelada(uuid)               to anon, authenticated;
grant execute on function remove_pelada_member(uuid, uuid) to anon, authenticated;
grant execute on function regenerate_join_code(uuid)       to anon, authenticated;
grant execute on function rename_pelada(uuid, text, integer) to anon, authenticated;
