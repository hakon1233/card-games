create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  game_type text not null check (game_type in ('crazy_eights', 'go_fish')),
  host_id uuid not null references auth.users(id) on delete cascade,
  host_display_name text not null default '',
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'done')),
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;

create policy "rooms_select_all" on public.rooms
  for select using (true);

create policy "rooms_insert_own" on public.rooms
  for insert with check (auth.uid() = host_id);

create policy "rooms_update_own" on public.rooms
  for update using (auth.uid() = host_id);
