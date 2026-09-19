-- 0024 — `column reference "player_id" is ambiguous` ao entrar por código
--
-- Entrar numa pelada pelo código (PRAINHA) estourava 42702:
--
--   ERROR: column reference "player_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   QUERY: insert into pelada_members (pelada_id, player_id, role, status)
--          values (v_id, v_player, 'player', 'active')
--          on conflict (pelada_id, player_id) do update ...
--
-- O motivo: `returns table (id uuid, slug text, player_id uuid)` põe
-- `player_id` em escopo como VARIÁVEL plpgsql. No alvo do `on conflict` só
-- cabe nome de coluna cru — não dá pra qualificar com alias — então o
-- plpgsql vê os dois e desiste. O corpo inteiro roda até essa linha, o que
-- explica o erro aparecer só na hora de entrar, e não antes.
--
-- ⚠️ A CORREÇÃO JÁ ESTAVA ESCRITA. O arquivo da `0022` (linha 277) traz
-- `returns table (id uuid, slug text, player uuid)` com o comentário
-- explicando exatamente esta armadilha. Só que o banco tem a versão
-- ANTERIOR: a `0022` foi aplicada, o arquivo foi corrigido depois, e
-- ninguém rodou de novo. É a lição da `0017` outra vez — migration lida e
-- não aplicada não conta. Esta 0024 existe pra que a correção tenha uma
-- migration própria, com número, em vez de morar num arquivo já aplicado.
--
-- Os dois clientes já aceitam os dois nomes (`row.player ?? row.player_id`,
-- em `src/lib/db.ts:223` e `mobile/lib/db.ts:223`), então a ordem entre
-- esta migration e o deploy não importa.
--
-- `drop` antes do `create`: o Postgres não deixa renomear coluna de saída
-- com `create or replace` — devolve "cannot change return type of existing
-- function". O `drop` derruba os grants junto, por isso eles voltam no fim.

begin;

drop function if exists join_pelada(text, text, uuid);

create function join_pelada(
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

grant execute on function join_pelada(text, text, uuid) to anon, authenticated;

commit;

-- ─────────────────────────────────────────────────────────────
-- Conferência. Esperado: `player`, e não `player_id`.
--
--   select pg_get_function_result(oid)
--     from pg_proc where proname = 'join_pelada';
--
-- E entrar de verdade, que é o que quebrava:
--
--   select * from join_pelada('PRAINHA', 'Fulano de Teste', null);
--   -- depois: delete from pelada_members where player_id = <o que voltou>;
--   --         delete from players where id = <o que voltou>;
-- ─────────────────────────────────────────────────────────────

-- NOTA, pra quem vier depois: `admin_add_roster_member` e
-- `claim_roster_invite` têm o MESMO defeito — `player_id` como coluna de
-- saída e `on conflict (pelada_id, player_id)` no corpo. Ficaram de fora de
-- propósito: nenhuma das duas é chamada por `src/` ou `mobile/`, são restos
-- do fluxo de convite por token que a `0022` aposentou quando o app deixou
-- de ter contas. Se alguma voltar a ser usada, quebra igual — e o conserto
-- é este mesmo.
