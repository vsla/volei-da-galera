-- Vôlei Prainha ZN — placar opcional
-- Rodar no SQL Editor do Supabase, depois de 0005.
--
-- O RESUMO.md decidiu "1 toque, sem placar", e a decisão continua de pé
-- pro caminho normal: no meio do jogo, à noite, com a mão cheia de areia,
-- ninguém digita ponto. Quem quiser registrar continua apertando só
-- "A ganhou".
--
-- Mas quando alguém está com o celular na mão marcando ponto a ponto
-- (a tela de placar), jogar esse número fora seria bobagem. Então as
-- colunas são NULL-áveis de propósito: partida sem placar é normal, não
-- é dado faltando.

alter table matches
  add column if not exists score_a int check (score_a >= 0),
  add column if not exists score_b int check (score_b >= 0);
