-- 0018 — A TELA DE DESTAQUES REABRE MARCADA
--
-- Sintoma (05/09, pelada da Prainha): quem votava e recarregava a tela
-- via o boletim em branco, "0 / 3" — mas o painel do organizador
-- contava o voto certinho e não cobrava a pessoa em "falta votar".
--
-- Causa: `highlight_votes` não tem policy de SELECT.
--   • a 0002 tirou a leitura de propósito ("escreve, não lê") porque
--     naquela altura não existia identidade — qualquer leitura seria
--     leitura do voto de todo mundo;
--   • a 0007 reafirmou isso e até confere no rodapé ("nenhuma linha
--     com cmd = 'SELECT' em highlight_votes");
--   • a 0014 devolveu a leitura do PRÓPRIO voto (`votes_read_own`),
--     agora que `current_player_id()` existe — mas só vale se a 0014
--     tiver sido aplicada neste banco.
--
-- O painel do organizador continua funcionando no meio disso tudo
-- porque ele NÃO lê a tabela: passa pela `highlight_voters` (0009), que
-- é security definer e não vê RLS. Daí o sintoma torto — o banco sabe
-- que você votou, a sua tela não.
--
-- E o sintoma é MUDO porque RLS não dá erro quando filtra: o cliente
-- recebe zero linha com `error` nulo, idêntico a "não votei".
--
-- Esta migration é pequena, idempotente e independente da 0014: roda
-- valendo o que já estiver de pé. Depois da 0014 ela é um no-op.
--
-- ⚠️ PRÉ-REQUISITO: 0013 (é ela que cria `current_player_id()`).

-- ─────────────────────────────────────────────────────────────
-- Ler o próprio voto — e SÓ o próprio.
--
-- A chave é `current_player_id()`, não um id que o cliente manda: o
-- nome no localStorage qualquer um digita, o dono da conta não. Sem
-- isso, "ler o meu voto" viraria "ler o de quem eu quiser", que é
-- exatamente o que a 0002 fechou.
-- ─────────────────────────────────────────────────────────────
drop policy if exists votes_read_own on highlight_votes;

create policy votes_read_own on highlight_votes
  for select to authenticated
  using (voter_id = current_player_id());

-- Realtime continua FORA: um evento por voto entregaria o timing de
-- quem votou e quando, que a 0002 e a 0007 tiraram de propósito.
do $$
begin
  execute 'alter publication supabase_realtime drop table highlight_votes';
exception when undefined_object or undefined_table then null;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Confere: rode isto depois e leia o resultado.
-- ─────────────────────────────────────────────────────────────
-- select policyname, cmd, qual
--   from pg_policies
--  where schemaname = 'public' and tablename = 'highlight_votes';
--
-- Esperado: UMA linha com cmd = 'SELECT', chamada votes_read_own, com
-- qual = (voter_id = current_player_id()).
--
-- E, no aparelho: vote, recarregue a tela. Os nomes têm que voltar
-- marcados e o botão tem que dizer "voto salvo ✓". Se voltar em branco
-- com o aviso amarelo, o jogador deste aparelho não foi reivindicado —
-- veja `claimPlayer` em src/lib/auth.ts.
