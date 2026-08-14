-- Estado da quadra e nota. Rodar depois do 0001.

-- Quem está segurando a quadra agora. Fica na sessão porque é o
-- estado corrente da noite, não um fato histórico da partida.
alter table sessions add column if not exists champion_ids uuid[] not null default '{}';
alter table sessions add column if not exists champion_streak int not null default 0;

-- Se o time A entrou nesta partida defendendo a quadra.
-- Não dá pra derivar de champion_streak: o perdedor que fica após o
-- vencedor ser desfeito entra com série zero e mesmo assim está defendendo.
alter table matches add column if not exists champion_stays boolean not null default false;

-- Nota, como no bot: 0..10, começa em 5, ±0.5 por partida.
alter table players add column if not exists rating numeric(4, 2) not null default 5.0
  check (rating >= 0 and rating <= 10);
