-- Vôlei Prainha ZN — schema inicial
-- Rodar no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- players
-- ─────────────────────────────────────────────────────────────
create table if not exists players (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  avatar_url text,
  is_guest   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- sessions — uma por sexta
-- ─────────────────────────────────────────────────────────────
create table if not exists sessions (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  status     text not null default 'open'
             check (status in ('open', 'playing', 'voting', 'closed')),
  team_size  int  not null default 6 check (team_size between 2 and 8),
  max_streak int  not null default 2 check (max_streak between 1 and 10),
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- session_players — check-in e contadores da noite
-- games_played é derivável de match_players, mas guardar
-- denormalizado deixa a ordenação da fila trivial.
-- ─────────────────────────────────────────────────────────────
create table if not exists session_players (
  session_id     uuid not null references sessions(id) on delete cascade,
  player_id      uuid not null references players(id)  on delete cascade,
  checked_in_at  timestamptz,
  games_played   int  not null default 0,
  last_played_at timestamptz,
  excluded       boolean not null default false,
  primary key (session_id, player_id)
);

create index if not exists session_players_queue_idx
  on session_players (session_id, games_played, last_played_at nulls first);

-- ─────────────────────────────────────────────────────────────
-- matches
-- champion_streak = vitórias seguidas do time que está na quadra
-- ─────────────────────────────────────────────────────────────
create table if not exists matches (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references sessions(id) on delete cascade,
  round           int  not null,
  status          text not null default 'active'
                  check (status in ('active', 'finished')),
  winner_team     text check (winner_team in ('A', 'B')),
  champion_streak int  not null default 0,
  seed            text not null default '',
  created_at      timestamptz not null default now(),
  finished_at     timestamptz,
  unique (session_id, round)
);

create index if not exists matches_session_idx on matches (session_id, round desc);

create table if not exists match_players (
  match_id  uuid not null references matches(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  team      text not null check (team in ('A', 'B')),
  locked    boolean not null default false,
  primary key (match_id, player_id)
);

-- ─────────────────────────────────────────────────────────────
-- highlight_votes — Destaques do Dia
-- voto é privado; contagem nunca é exposta por jogador
-- ─────────────────────────────────────────────────────────────
create table if not exists highlight_votes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  voter_id   uuid not null references players(id)  on delete cascade,
  player_id  uuid not null references players(id)  on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, voter_id, player_id),
  check (voter_id <> player_id)
);

-- ─────────────────────────────────────────────────────────────
-- RLS aberta. É vôlei entre amigos, não banco.
-- Ações de organizador são barradas na camada de route handler
-- (cookie httpOnly com o PIN), não aqui.
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'players', 'sessions', 'session_players',
    'matches', 'match_players', 'highlight_votes'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_open', t);
    execute format(
      'create policy %I on %I for all to anon, authenticated using (true) with check (true)',
      t || '_open', t
    );
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────
-- Realtime — o lobby ao vivo depende disso
-- ─────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'sessions', 'session_players', 'matches', 'match_players', 'highlight_votes'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
