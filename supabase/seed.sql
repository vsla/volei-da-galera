-- Vôlei Prainha ZN — seed
-- Idempotente: pode rodar de novo sem duplicar.

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

-- Sessão da próxima sexta (ou de hoje, se hoje for sexta)
insert into sessions (date)
select (current_date + ((5 - extract(isodow from current_date)::int + 7) % 7))::date
on conflict (date) do nothing;
