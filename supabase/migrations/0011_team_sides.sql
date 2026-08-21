-- 0011 — O LADO DO TIME
--
-- Playtest 01 §5: quem segurava a quadra era renomeado a cada partida,
-- porque a rotação assumia "quem fica é sempre o time A". Na areia o
-- time não troca de lado da rede — a tela é que trocava a letra. Deu
-- ponto no time errado.
--
-- Agora o lado é DADO, não convenção: a sessão guarda em que lado o
-- campeão está, a partida guarda quem era o dono da quadra, e trocar de
-- lado é uma ação explícita do organizador.

alter table sessions add column if not exists champion_team text
  check (champion_team in ('A', 'B'));

alter table matches  add column if not exists holder_team text
  check (holder_team in ('A', 'B'));

-- Backfill: até aqui, quem segurava a quadra era sempre o A.
update matches
   set holder_team = 'A'
 where holder_team is null and champion_stays is true;

update sessions
   set champion_team = 'A'
 where champion_team is null
   and champion_ids is not null
   and array_length(champion_ids, 1) > 0;

-- ─────────────────────────────────────────────────────────────
-- swap_sides — a galera trocou de lado de verdade (sol, vento, set
-- novo). Troca os dois times de lado E o placar junto, numa transação
-- só: meio caminho aqui é exatamente o bug que a gente está matando.
-- ─────────────────────────────────────────────────────────────
create or replace function swap_sides(p_match uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  select session_id into v_session from matches where id = p_match and status = 'active';
  if v_session is null then
    return;
  end if;

  update match_players
     set team = case when team = 'A' then 'B' else 'A' end
   where match_id = p_match;

  update matches
     set score_a = coalesce(score_b, 0),
         score_b = coalesce(score_a, 0),
         holder_team = case holder_team when 'A' then 'B' when 'B' then 'A' else null end,
         score_updated_at = now()
   where id = p_match;

  update sessions
     set champion_team = case champion_team when 'A' then 'B' when 'B' then 'A' else null end
   where id = v_session;
end $$;

grant execute on function swap_sides(uuid) to anon, authenticated;
