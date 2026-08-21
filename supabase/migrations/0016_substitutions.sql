-- 0016 — SUBSTITUIÇÃO
--
-- Playtest 01 §6: "às vezes um sai e outro entra no lugar. Se ele estava
-- no time que ganhou e mudou lá no sistema, ele meio que só joga uma a
-- mais — deveria não contar e continuar, daí ele sairia na próxima."
--
-- Hoje a substituição é um `update match_players set player_id = ...`,
-- que DESTRÓI a informação de quem começou a partida. Sem saber quem
-- entrou no meio, não dá pra tratar diferente — então primeiro a gente
-- guarda o fato, depois a regra escolhe o que fazer com ele
-- (`substitutionMode`, em settings).

alter table match_players add column if not exists joined_mid boolean not null default false;
alter table match_players add column if not exists substituted_for uuid references players(id) on delete set null;
alter table match_players add column if not exists joined_at timestamptz;

comment on column match_players.joined_mid is
  'entrou depois do apito inicial — no modo tapa_buraco não conta a partida';
comment on column match_players.substituted_for is
  'quem ele substituiu; esse sim contou a partida que jogou';
