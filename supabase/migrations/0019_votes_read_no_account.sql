-- 0019 — RELER O PRÓPRIO VOTO SEM PRECISAR DE CONTA
--
-- A 0018 amarrou a leitura em `current_player_id()`: só relê o voto
-- quem reivindicou o jogador com uma conta. É o certo a longo prazo e
-- é caro agora — a maior parte da galera entra pelo caminho do
-- convidado, clicando no nome, e ficaria sem ver o próprio voto.
--
-- Decisão (05/09): POR AGORA a leitura vale pelo mesmo nível de
-- confiança do resto do app — o "clique no seu nome" da identity.ts,
-- que já é assumidamente frouxo e está lá escrito:
--
--   "Qualquer um consegue clicar no nome de qualquer um, e entre
--    amigos isso é aceitável."   — src/lib/identity.ts
--
-- ⚠️ O QUE ISSO CUSTA, escrito pra quem vier depois: quem abrir o
-- DevTools e chamar esta função com o id de outra pessoa vê o voto
-- daquela pessoa — e os ids de todos os jogadores já vão pro cliente
-- na tela ao vivo. O voto deixa de ser secreto contra alguém
-- determinado; continua secreto no uso normal (a tela nunca mostra
-- voto alheio, e a contagem continua só pela `highlight_tally`).
--
-- Este é o teto de privacidade que identidade por localStorage
-- permite. Não dá pra ter as duas coisas: ou o banco sabe QUEM está
-- perguntando (conta), ou ele acredita no id que o cliente mandou.
--
-- PRA VOLTAR A FECHAR: basta apagar esta função —
--   drop function if exists highlight_votes_by(uuid, uuid);
-- a leitura cai de volta na `votes_read_own` da 0018, que é
-- inforjável, e a tela passa a exigir conta pra reabrir marcada.

-- ─────────────────────────────────────────────────────────────
-- O nome é honesto de propósito: NÃO é `my_votes`. Ela devolve o voto
-- do id que você mandar, e quem lê este arquivo tem que ver isso.
--
-- Devolve só `player_id`, nunca o `voter_id`, e filtra por sessão: não
-- serve pra varrer o histórico de ninguém.
-- ─────────────────────────────────────────────────────────────
create or replace function highlight_votes_by(
  p_session_id uuid,
  p_voter_id   uuid
)
returns table (player_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select v.player_id
    from highlight_votes v
   where v.session_id = p_session_id
     and v.voter_id = p_voter_id;
$$;

revoke all on function highlight_votes_by(uuid, uuid) from public;
grant execute on function highlight_votes_by(uuid, uuid) to anon, authenticated;

-- A `votes_read_own` da 0018 fica de pé. Ela não atrapalha (a função
-- é security definer e não passa por policy) e é o caminho que sobra
-- quando esta função for apagada.
--
-- Confere:
--   select highlight_votes_by('<sessao>', '<jogador>');
-- e, no aparelho: vote, recarregue, os nomes voltam marcados.
