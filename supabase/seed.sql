-- Vôlei da Galera — seed
-- Idempotente: pode rodar de novo sem duplicar.
--
-- Desde a 0012 tudo pendura numa PELADA. O seed cria a da Prainha (a
-- mesma que a migration cria, se o banco já tinha dados), põe a galera
-- como membro e abre a sessão da próxima sexta.

insert into peladas (slug, name, weekday, join_code)
select 'prainha-zn', 'Vôlei da Sexta — Prainha ZN', 5, 'PRAINHA'
where not exists (select 1 from peladas where slug = 'prainha-zn');

insert into players (name)
select v.name
from (values
  ('Miguel'), ('Vinícius Lamarck'), ('Amanda Lavs'), ('Arthur Farias'),
  ('Maria Gabrielly'), ('Suzana Rodrigues'), ('Pedro Augusto'), ('Brenda Dias'),
  ('Ewerton'), ('Lenin Pastichi'), ('Álvaro Gabriel'), ('Ítalo Thiago'),
  ('Leandro'), ('João Victor'), ('Mateus'), ('Guilherme'),
  ('Victor'), ('João'), ('Alisson'), ('Brenno'),
  ('Neto'), ('Fefa'), ('Baca'), ('Bia'), ('Tali')
) as v(name)
where not exists (select 1 from players p where p.name = v.name);

-- todo mundo vira membro da pelada (a nota nasce em 5, como no bot)
insert into pelada_members (pelada_id, player_id, role)
select pl.id, p.id, 'player'
  from peladas pl, players p
 where pl.slug = 'prainha-zn'
   and coalesce(p.is_guest, false) = false
on conflict (pelada_id, player_id) do nothing;

-- Sessão da próxima sexta (ou de hoje, se hoje for sexta)
insert into sessions (pelada_id, date)
select pl.id, (current_date + ((5 - extract(isodow from current_date)::int + 7) % 7))::date
  from peladas pl
 where pl.slug = 'prainha-zn'
on conflict (pelada_id, date) do nothing;
