-- Vôlei Prainha ZN — rodadas esperando
-- Rodar no SQL Editor do Supabase, depois de 0004.
--
-- Até aqui a espera era medida por `last_played_at` (timestamp). Funciona
-- pra ordenar, mas é ilegível na tela: ninguém reclama "joguei às 21:14",
-- reclama "tô fora há 3 rodadas".
--
-- Vem do bot do Neto (core.py, `rodadas_esperando`): +1 em todo mundo que
-- ficou de fora a cada partida REGISTRADA, e zero pra quem jogou. Quem é
-- sorteado e substituído antes do apito não perde a espera acumulada.

alter table session_players
  add column if not exists rounds_waiting int not null default 0
    check (rounds_waiting >= 0);
