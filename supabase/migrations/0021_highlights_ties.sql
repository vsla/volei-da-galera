-- 0021 — EMPATE NÃO SE DESEMPATA POR ORDEM ALFABÉTICA
--
-- Sintoma (05/09): a mesma noite mostrava destaques diferentes em
-- telas diferentes. O card dizia Antonella, o app dizia Fernanda.
--
-- Causa: quatro pessoas empataram em 5 votos disputando a terceira
-- vaga (Antonella, Fernanda, Lênin e Victor Alves), e cada caminho
-- escolhia uma:
--
--   • esta função cortava com `row_number() ... order by votes desc,
--     p.name` — ou seja, desempatava por ORDEM ALFABÉTICA;
--   • o `fetchHighlights` cortava com um `slice(0, 3)` sobre a
--     `highlight_tally`, que ordena por `votes desc, player_id` — ou
--     seja, desempatava por UUID.
--
-- As duas eram determinísticas. Só discordavam entre si, e o card que
-- vai pro grupo podia contradizer o que a galera viu no app.
--
-- Decisão (05/09, VS): quem empatou entra junto. Cortar em três
-- exigiria um critério de desbanque, e é justamente isso que esta tela
-- decidiu não ter — o `fetchHighlights` já ordena os vencedores em
-- ordem alfabética com o comentário "sem pódio, sem 1º lugar". Um
-- empate desfeito por nome é o pódio entrando pela porta dos fundos.
--
-- `rank()` no lugar de `row_number()`, e o `p.name` sai da janela: com
-- ele de volta, todo empate vira posição única de novo e nada muda.
--
-- Efeito: uma noite com empate na última vaga mostra mais de três
-- nomes. Numa noite normal (top 3 sem empate) o resultado é idêntico
-- ao de antes.

create or replace function highlight_days_pelada(
  p_pelada uuid,
  p_limit  integer default 30
)
returns table (
  session_id uuid,
  played_on  date,
  player_id  uuid,
  name       text,
  votes      bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recentes as (
    select id, date from sessions
     where pelada_id = p_pelada
     order by date desc
     limit p_limit
  ),
  contagem as (
    select
      v.session_id,
      r.date as played_on,
      v.player_id,
      p.name,
      count(*)::bigint as votes,
      -- rank(), não row_number(): quem tem a mesma contagem divide a
      -- mesma posição e entra junto no corte
      rank() over (
        partition by v.session_id
        order by count(*) desc
      ) as pos
    from highlight_votes v
    join recentes r on r.id = v.session_id
    join players  p on p.id = v.player_id
    group by v.session_id, r.date, v.player_id, p.name
  )
  select session_id, played_on, player_id, name, votes
    from contagem
   where pos <= 3
   order by played_on desc, name;
$$;

revoke all on function highlight_days_pelada(uuid, integer) from public;
grant execute on function highlight_days_pelada(uuid, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';

-- Confere na noite de 04/09, que tem o empate quádruplo em 5 votos:
--   select name, votes from highlight_days_pelada(
--     (select id from peladas where slug = 'prainha-zn'), 30)
--    where played_on = '2026-09-04' order by votes desc, name;
-- Esperado: 6 nomes — Luizinho (9), Ítalo (6) e os quatro de 5.
