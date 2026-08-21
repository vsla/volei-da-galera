-- 0010 — PLACAR AO VIVO, entre aparelhos
--
-- Playtest 01: quem marcava ponto era o único que via o placar. Ele
-- vivia no localStorage de UM celular e só chegava ao banco no
-- finishMatch. Aqui o placar vira estado do banco como o resto da noite:
-- todo mundo vê o mesmo, recarregar não perde, e dá pra marcar de dois
-- aparelhos ao mesmo tempo.
--
-- Por que RPC e não update: com `update ... set score_a = 5` o último a
-- escrever apaga o ponto do outro marcador. `bump_score` incrementa
-- DENTRO do banco, então dois toques simultâneos viram dois pontos.

alter table matches add column if not exists score_updated_at timestamptz;

-- ─────────────────────────────────────────────────────────────
-- bump_score — incremento atômico. Devolve o placar já novo, pra
-- tela do marcador não precisar esperar o realtime dar a volta.
-- ─────────────────────────────────────────────────────────────
create or replace function bump_score(
  p_match uuid,
  p_team  text,
  p_delta int
)
returns table (score_a int, score_b int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_team not in ('A', 'B') then
    raise exception 'time inválido: %', p_team;
  end if;

  return query
  update matches m
     set score_a = case when p_team = 'A'
                        then greatest(0, coalesce(m.score_a, 0) + p_delta)
                        else coalesce(m.score_a, 0) end,
         score_b = case when p_team = 'B'
                        then greatest(0, coalesce(m.score_b, 0) + p_delta)
                        else coalesce(m.score_b, 0) end,
         score_updated_at = now()
   where m.id = p_match
     -- partida encerrada é somente leitura: o placar dela é resultado,
     -- não estado. (Playtest 01 §10)
     and m.status = 'active'
  returning m.score_a, m.score_b;
end $$;

-- ─────────────────────────────────────────────────────────────
-- reset_score — o botão "zerar", pra quando marcaram no lado errado
-- ─────────────────────────────────────────────────────────────
create or replace function reset_score(p_match uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update matches
     set score_a = 0, score_b = 0, score_updated_at = now()
   where id = p_match and status = 'active';
$$;

grant execute on function bump_score(uuid, text, int) to anon, authenticated;
grant execute on function reset_score(uuid)           to anon, authenticated;
