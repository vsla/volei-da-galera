-- Lista da sexta 21/08/2026 — Prainha ZN (24 pessoas)
--
-- Idempotente: pode rodar de novo sem duplicar.
-- Rode no SQL Editor do Supabase DEPOIS de habilitar o login anônimo.
--
-- Os "convidados" (is_guest) são os que vieram com alguém: o nome guarda
-- o anfitrião entre parênteses de propósito, porque é assim que a galera
-- vai procurar na tela — e porque desempata "Guilherme" e "João", que já
-- existem como habituais.

-- ─────────────────────────────────────────────────────────────
-- 1. Nomes que mudaram desde o seed (mantém o id, e com ele a nota
--    e o histórico da pessoa)
-- ─────────────────────────────────────────────────────────────
update players set name = 'Amanda Lays'     where name = 'Amanda Lavs';
update players set name = 'Talisson Mendes' where name = 'Tali';
update players set is_guest = false         where name = 'Caio César';

-- ─────────────────────────────────────────────────────────────
-- 2. Os 16 habituais
-- ─────────────────────────────────────────────────────────────
insert into players (name, is_guest)
select v.name, false
from (values
  ('Anderson Nogueira'), ('Caio César'),      ('Amanda Lays'),     ('Talisson Mendes'),
  ('Fernanda Paes'),     ('Matheus Paiva'),   ('Victor Alves'),    ('Antonela Carvalho'),
  ('Arthur Farias'),     ('Suzana Rodrigues'),('Vinícius Lamarck'),('Lenin Pastichi'),
  ('Ítalo Thiago'),      ('Miguel'),          ('Ewerton'),         ('Álvaro Gabriel')
) as v(name)
where not exists (select 1 from players p where p.name = v.name);

-- ─────────────────────────────────────────────────────────────
-- 3. Os 8 convidados da noite
-- ─────────────────────────────────────────────────────────────
insert into players (name, is_guest)
select v.name, true
from (values
  ('João (Su)'),      ('Lauren (Alv)'), ('Guilherme (Le)'), ('Mesa 22 (Tali)'),
  ('Yuri (Lenin)'),   ('Hugo (Caio)'),  ('João B (Ito)'),   ('Deyse (Ito)')
) as v(name)
where not exists (select 1 from players p where p.name = v.name);

-- ─────────────────────────────────────────────────────────────
-- 4. Todos viram membros da pelada (habitual = player, convidado = guest).
--    A nota nasce em 5 pra quem é novo; quem já era membro não é tocado.
-- ─────────────────────────────────────────────────────────────
insert into pelada_members (pelada_id, player_id, role)
select pl.id, p.id, case when p.is_guest then 'guest' else 'player' end
  from peladas pl
  join players p on p.name in (
    'Anderson Nogueira','Caio César','Amanda Lays','Talisson Mendes',
    'Fernanda Paes','Matheus Paiva','Victor Alves','Antonela Carvalho',
    'Arthur Farias','Suzana Rodrigues','Vinícius Lamarck','Lenin Pastichi',
    'Ítalo Thiago','Miguel','Ewerton','Álvaro Gabriel',
    'João (Su)','Lauren (Alv)','Guilherme (Le)','Mesa 22 (Tali)',
    'Yuri (Lenin)','Hugo (Caio)','João B (Ito)','Deyse (Ito)'
  )
 where pl.slug = 'prainha-zn'
on conflict (pelada_id, player_id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- 5. A sessão de hoje, aberta
-- ─────────────────────────────────────────────────────────────
insert into sessions (pelada_id, date, status)
select pl.id, date '2026-08-21', 'open'
  from peladas pl
 where pl.slug = 'prainha-zn'
on conflict (pelada_id, date) do update set status = 'open';

-- ─────────────────────────────────────────────────────────────
-- 6. OPCIONAL — check-in dos 12 que já confirmaram (✅ na lista).
--    Descomente se quiser que eles já apareçam na fila; o resto do
--    pessoal faz o próprio check-in na praia, que é a graça do site.
-- ─────────────────────────────────────────────────────────────
-- insert into session_players (session_id, player_id, checked_in_at)
-- select s.id, p.id, now()
--   from sessions s
--   join peladas pl on pl.id = s.pelada_id and pl.slug = 'prainha-zn'
--   join players p on p.name in (
--     'Amanda Lays','Talisson Mendes','Suzana Rodrigues','Vinícius Lamarck',
--     'Lenin Pastichi','Ewerton','Álvaro Gabriel','João (Su)',
--     'Mesa 22 (Tali)','Yuri (Lenin)','João B (Ito)','Deyse (Ito)'
--   )
--  where s.date = date '2026-08-21'
-- on conflict (session_id, player_id) do update set checked_in_at = now();

-- Conferência
select p.name, m.role, p.is_guest
  from pelada_members m
  join players p on p.id = m.player_id
  join peladas pl on pl.id = m.pelada_id and pl.slug = 'prainha-zn'
 order by p.is_guest, p.name;
