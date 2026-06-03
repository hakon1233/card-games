-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Users table (mirrors Supabase Auth users, extended with game profile fields)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  username text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

-- Games table
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  game_type text not null default 'blackjack',
  status text not null default 'waiting',
  state jsonb,
  config jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

-- Game players (one row per player per game, including bots)
create table if not exists public.game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  seat_index int not null,
  is_bot boolean not null default false,
  score int,
  created_at timestamptz not null default now(),
  unique(game_id, seat_index)
);

-- Game moves / action log
create table if not exists public.game_moves (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid references public.users(id) on delete set null,
  move_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- Row Level Security
alter table public.users enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.game_moves enable row level security;

-- Users can read/update their own profile
create policy "users_own" on public.users
  for all using (auth.uid() = id);

-- Any authenticated user (including anonymous) can create or read games
create policy "games_authenticated_read" on public.games
  for select using (auth.role() = 'authenticated');

create policy "games_authenticated_insert" on public.games
  for insert with check (auth.role() = 'authenticated');

create policy "games_authenticated_update" on public.games
  for update using (auth.role() = 'authenticated');

-- Game players readable by participants
create policy "game_players_read" on public.game_players
  for select using (auth.role() = 'authenticated');

create policy "game_players_insert" on public.game_players
  for insert with check (auth.role() = 'authenticated');

-- Game moves readable by participants
create policy "game_moves_read" on public.game_moves
  for select using (auth.role() = 'authenticated');

create policy "game_moves_insert" on public.game_moves
  for insert with check (auth.role() = 'authenticated');

-- Auto-create user profile row on sign-up (including anonymous)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, email, is_anonymous)
  values (
    new.id,
    new.email,
    coalesce((new.raw_user_meta_data->>'is_anonymous')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
