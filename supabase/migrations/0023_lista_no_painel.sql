-- 0023 — A LISTA DA SEMANA SAI DO SQL EDITOR E VAI PRO PAINEL
--
-- Até aqui, o caminho da lista do WhatsApp até a tela de check-in era um
-- arquivo `.sql` escrito à mão (`supabase/roster_2026_09_04.sql`,
-- `roster_2026_09_11.sql`). Quatro defeitos, na ordem em que doem:
--
--   1. só quem tem o painel do Supabase consegue. Quem organiza a pelada
--      não abre o SQL Editor, e o app tem `owner` e `admin` que não
--      servem pra montar a lista da semana;
--   2. os rosters começam com `delete from players`, porque era o único
--      jeito de "trocar a lista" sem tela. Cada sexta zerava a nota de
--      todo mundo e o histórico inteiro;
--   3. a data da sessão morava no SQL. Errar a linha (aconteceu: a lista
--      dizia "24/09", que não era sexta) = tela vazia na praia, 21h;
--   4. nome de cima da hora não tinha caminho nenhum pela tela.
--
-- Esta migration resolve (1), (2) e (4). A (3) é a tela — `ensureTodaySession`
-- com a data de São Paulo calculada no cliente.
--
-- ⚠️ PRÉ-REQUISITO: a 0022, que é a fonte da verdade das policies. As duas
--    funções aqui são `security definer` no molde dela (§9: escrita que
--    depende de outra escrita mora numa função do banco) — `add_member`
--    escreve em `players` E em `pelada_members`, e metade disso gravado
--    é pior que nada gravado.
--
-- Idempotente: pode rodar de novo.
--
-- NADA de schema novo. `pelada_members` já tem `status` (active/removed),
-- `role` e `rating` por pelada — o modelo aguentava o v3 desde a 0012.

-- ─────────────────────────────────────────────────────────────
-- 1. Acentos — é o que faz "Lenin" achar "Lênin".
--
-- A lista do grupo é digitada no teclado do celular, e metade dos acentos
-- se perde no caminho. Sem isso, colar a lista da sexta duplica o Lênin,
-- o Álvaro e o Ítalo toda semana, cada um com nota 5 de novo.
--
-- Usa o `unaccent_safe` da 0017, NÃO a extensão `unaccent`. A 0017 já
-- tinha tomado essa decisão ("sem depender da extensão"), e ela está
-- certa aqui por um motivo específico: no Supabase o
-- `create extension unaccent` instala no schema `extensions`, e as duas
-- funções abaixo são `set search_path = public`. O `unaccent()` cru
-- resolveria no SQL Editor e falharia em runtime pelo PostgREST.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- 2. `add_member` — cadastra UM nome na pelada.
--
-- Idempotente de propósito: rodar de novo devolve o mesmo jogador em vez
-- de criar um homônimo. É o que deixa colar a lista inteira toda sexta
-- sem medo, e é o que o `join_as_guest` (0022) nunca fez — ele sempre
-- cria nome novo e sempre com `role = 'guest'`.
--
-- Quem volta depois de uma semana fora é REATIVADO, não recriado: a nota
-- e o histórico estão amarrados ao `player_id`, e recriar significaria
-- recomeçar em 5. Esse era o custo escondido do `delete from players`.
-- ─────────────────────────────────────────────────────────────
create or replace function add_member(
  p_pelada uuid,
  p_name   text,
  p_guest  boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name   text := nullif(trim(regexp_replace(p_name, '\s+', ' ', 'g')), '');
  v_player uuid;
begin
  if v_name is null then
    raise exception 'diga o nome';
  end if;

  if not exists (select 1 from peladas where id = p_pelada) then
    raise exception 'essa pelada não existe';
  end if;

  -- Já é desta pelada? Compara sem acento e sem caixa. Note que a
  -- comparação é um PALPITE, não uma regra: `Guilherme (Lê)` e
  -- `Guilherme (Ito)` são duas pessoas, `Thiago` e `Ítalo Thiago`
  -- também. Por isso mora aqui e não num `unique` — a prévia do painel
  -- mostra o palpite antes de gravar, e uma constraint viraria erro cru
  -- na tela, no meio da sexta.
  select m.player_id into v_player
    from pelada_members m
    join players p on p.id = m.player_id
   where m.pelada_id = p_pelada
     and lower(unaccent_safe(p.name)) = lower(unaccent_safe(v_name))
   limit 1;

  if v_player is not null then
    update pelada_members
       set status = 'active'
     where pelada_id = p_pelada
       and player_id = v_player
       and status is distinct from 'active';
    return v_player;
  end if;

  insert into players (name, is_guest)
  values (v_name, coalesce(p_guest, false))
  returning id into v_player;

  insert into pelada_members (pelada_id, player_id, role)
  values (p_pelada, v_player, case when p_guest then 'guest' else 'player' end)
  on conflict (pelada_id, player_id) do nothing;

  return v_player;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3. `sync_members` — quem não está na lista da semana sai da tela.
--
-- `status = 'removed'`, NUNCA `delete`: nota, histórico e partidas ficam
-- inteiros no banco. Voltar é colar o nome de novo na semana seguinte, e
-- a nota volta junto (o `add_member` acima reativa). É a diferença entre
-- o v3 e os `.sql` de reset — eles faziam a mesma coisa na tela e
-- apagavam tudo por trás.
--
-- DUAS TRAVAS, e as duas moram aqui em vez de na tela:
--
--   • `owner` e `admin` são imunes, mesmo fora da lista. Quem monta a
--     lista às vezes não joga, e pelada sem organizador é irrecuperável
--     pela tela — foi a lição da 0017;
--   • uma chamada, uma transação. Sincronizar pela metade (dez `update`
--     do cliente, a rede da praia cai no sexto) é pior que não
--     sincronizar.
--
-- Devolve quantos saíram, pra tela poder dizer o número em vez de "ok".
-- ─────────────────────────────────────────────────────────────
create or replace function sync_members(
  p_pelada uuid,
  p_names  text[]
) returns integer
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

  -- A MESMA normalização do `add_member` acima, incluindo o colapso de
  -- espaços internos. Se as duas divergirem, um nome com espaço duplo
  -- entra por `add_member` como "Joao Silva" e sai daqui como chave
  -- "joao  silva" — não casa, e o jogador vira 'removed' na sexta
  -- seguinte. O cliente já colapsa, mas as duas são `grant ... to anon`.
  select array_agg(lower(unaccent_safe(trim(regexp_replace(n, '\s+', ' ', 'g')))))
    into v_chaves
    from unnest(coalesce(p_names, '{}'::text[])) as n
   where nullif(trim(n), '') is not null;

  -- Lista vazia não sincroniza. Um textarea limpo por engano tiraria a
  -- pelada inteira da tela, e a prévia teria mostrado "saem 23" — mas
  -- quem aperta rápido aperta rápido. Nada aqui é irreversível, e ainda
  -- assim não é pra acontecer por acidente.
  if v_chaves is null or cardinality(v_chaves) = 0 then
    raise exception 'a lista está vazia — nada foi sincronizado';
  end if;

  update pelada_members m
     set status = 'removed'
    from players p
   where p.id = m.player_id
     and m.pelada_id = p_pelada
     and coalesce(m.status, 'active') <> 'removed'
     and coalesce(m.role, 'player') not in ('owner', 'admin')
     and not (lower(unaccent_safe(p.name)) = any (v_chaves));

  get diagnostics v_saem = row_count;

  return v_saem;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 4. Os grants. Sem eles o PostgREST devolve 404 e a tela diz que a
--    função não existe — o mesmo sintoma torto da 0019.
--
-- Sobre a exposição: qualquer um que abra o site pode chamar as duas.
-- É a MESMA exposição do `join_as_guest` desde a 0022, que trocou RLS
-- por confiança entre amigos de propósito (a anon key está no bundle e
-- o site é o link que roda no grupo do WhatsApp). O v3 não muda essa
-- decisão, e não é ele que deve mudá-la.
-- ─────────────────────────────────────────────────────────────
grant execute on function add_member(uuid, text, boolean)  to anon, authenticated;
grant execute on function sync_members(uuid, text[])       to anon, authenticated;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────
-- Conferência, depois de aplicar:
--
--   -- o mesmo nome duas vezes dá UM jogador
--   select add_member(id, 'Teste Dobrado') from peladas where slug = 'prainha-zn';
--   select add_member(id, 'teste  dobrado') from peladas where slug = 'prainha-zn';
--   select count(*) from players where name ilike 'teste dobrado';  -- 1
--
--   -- sincronizar não derruba o organizador
--   select sync_members(id, array['Ninguém']) from peladas where slug = 'prainha-zn';
--   select p.name, m.role, m.status from pelada_members m
--     join players p on p.id = m.player_id where m.role in ('owner','admin');
--   -- todos ainda 'active'
-- ─────────────────────────────────────────────────────────────
