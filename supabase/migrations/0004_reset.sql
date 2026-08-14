-- Vôlei Prainha ZN — resetar a noite e desfazer o encerramento
-- Rodar no SQL Editor do Supabase, depois de 0003.
--
-- A 0003 só deixava apagar partida em aberto, pra proteger o histórico.
-- Na prática isso tornava o reset impossível pelo app: as partidas já
-- encerradas ficavam lá e a noite nunca voltava ao zero.
--
-- Escolha consciente: liberar o delete de matches e de votos.
-- Sessions e players continuam sem delete — é lá que o cascade levaria
-- a noite inteira (ou o cadastro de todo mundo) junto.
--
-- Isso NÃO é proteção contra quem abre o DevTools: com a publishable
-- key no bundle, quem quiser apagar as partidas de hoje consegue. O PIN
-- do organizador barra na tela, não no banco — mesma postura da 0001.
-- Se um dia isso incomodar, o caminho é mover o reset pra um route
-- handler com service role.

drop policy if exists matches_delete_active on matches;

create policy matches_delete on matches
  for delete to anon, authenticated using (true);

-- votos precisam sumir junto: reset que deixa os Destaques da noite
-- anterior de pé não é reset.
create policy highlight_votes_delete on highlight_votes
  for delete to anon, authenticated using (true);
