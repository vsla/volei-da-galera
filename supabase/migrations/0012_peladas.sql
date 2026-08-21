-- 0012 — PELADAS
--
-- O v1 assumiu UMA pelada, implícita: uma sessão por data, uma lista de
-- nomes global, uma nota por pessoa. Todo pedido do playtest 01 ("criar
-- pelada", "papéis", "painéis") esbarra nessa suposição.
--
-- Aqui a pelada vira entidade: "Vôlei da Sexta" tem N sessões (uma por
-- noite), N membros, e a configuração dela.
--
-- ⚠️ ORDEM: rode esta migration ANTES de subir o deploy novo. Ela é
-- retrocompatível de propósito (o app antigo continua funcionando com
-- ela aplicada), pra não existir janela de site quebrado.

-- ─────────────────────────────────────────────────────────────
-- peladas
-- ─────────────────────────────────────────────────────────────
create table if not exists peladas (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  cover_url  text,
  /** dia habitual (0 = domingo). Só rótulo: a sessão manda na data. */
  weekday    int check (weekday between 0 and 6),
  /** código pra entrar sem link. Curto de propósito: é digitado na praia. */
  join_code  text unique,
  /**
   * Configuração da pelada (ver src/lib/settings.ts).
   *
   * jsonb, e não uma coluna por regra, porque o pedido do playtest foi
   * literalmente "deixar mais configurável": cada ajuste novo viraria
   * uma migration e um deploy.
   */
  settings   jsonb not null default '{}'::jsonb,
  created_by uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- pelada_members — quem é da pelada, com que papel e com que nota
--
-- A NOTA MORA AQUI, não em players. Sua nota no vôlei da sexta não diz
-- nada sobre o vôlei de domingo — e, juntas, elas se contaminariam.
-- ─────────────────────────────────────────────────────────────
create table if not exists pelada_members (
  pelada_id uuid not null references peladas(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  role      text not null default 'player'
            check (role in ('owner', 'admin', 'player', 'guest')),
  status    text not null default 'active'
            check (status in ('active', 'invited', 'removed')),
  rating    numeric(4,2) not null default 5 check (rating between 0 and 10),
  joined_at timestamptz not null default now(),
  primary key (pelada_id, player_id)
);

create index if not exists pelada_members_player_idx on pelada_members (player_id);

-- ─────────────────────────────────────────────────────────────
-- sessions ganha dono
-- ─────────────────────────────────────────────────────────────
alter table sessions add column if not exists pelada_id uuid references peladas(id) on delete cascade;
alter table sessions add column if not exists settings  jsonb not null default '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────
-- MIGRAÇÃO DOS DADOS — a parte que não pode dar errado
--
-- Tudo que existe hoje é a pelada da Prainha. Cria ela, liga as sessões,
-- e converte cada player em membro COPIANDO a nota. A cópia vem antes de
-- qualquer coisa depender dela.
-- ─────────────────────────────────────────────────────────────
do $$
declare v_pelada uuid;
begin
  if exists (select 1 from sessions where pelada_id is null) then
    select id into v_pelada from peladas where slug = 'prainha-zn';

    if v_pelada is null then
      insert into peladas (slug, name, weekday, join_code)
      values ('prainha-zn', 'Vôlei da Sexta — Prainha ZN', 5, 'PRAINHA')
      returning id into v_pelada;
    end if;

    update sessions set pelada_id = v_pelada where pelada_id is null;

    -- todo mundo que já jogou vira membro, com a nota que tinha
    insert into pelada_members (pelada_id, player_id, rating, role)
    select v_pelada, p.id, coalesce(p.rating, 5),
           case when p.is_guest then 'guest' else 'player' end
      from players p
     on conflict (pelada_id, player_id) do nothing;
  end if;
end $$;

-- a data deixa de ser única no mundo e passa a ser única DENTRO da pelada
alter table sessions drop constraint if exists sessions_date_key;
create unique index if not exists sessions_pelada_date_idx on sessions (pelada_id, date);

-- ⚠️ players.rating continua existindo de propósito: enquanto o deploy
-- antigo estiver no ar, é ele quem a versão velha lê e escreve. Depois
-- do deploy novo a coluna está MORTA — a nota válida é a de
-- pelada_members.rating. Uma migration futura pode derrubá-la.

-- RLS: por enquanto aberta, como o resto (ver reasonable.md §9). A
-- 0014 fecha tudo junto com os papéis — antes disso, fechar aqui só
-- quebraria a tela ao vivo sem proteger nada.
do $$
declare t text;
begin
  foreach t in array array['peladas', 'pelada_members'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_open', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_open', t
    );
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
