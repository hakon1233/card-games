-- The app keeps game state in the browser and in the PartyKit room, never in
-- these tables, and their row-level security let any signed-in user rewrite any
-- game.
drop table if exists public.game_moves;
drop table if exists public.game_players;
drop table if exists public.games;

-- A security-definer function must not resolve names through the caller's
-- search_path.
alter function public.handle_new_user() set search_path = public;

-- Rooms: the public anon key could list every room (code, host, host name).
-- Hosts now read only their own rooms; anyone holding a room code (the invite
-- link) looks up that one room through room_by_code.
drop policy if exists "rooms_select_all" on public.rooms;
create policy "rooms_select_own" on public.rooms
  for select using (auth.uid() = host_id);

drop policy if exists "rooms_update_own" on public.rooms;
create policy "rooms_update_own" on public.rooms
  for update using (auth.uid() = host_id) with check (auth.uid() = host_id);

create or replace function public.room_by_code(room_code text)
returns table (code text, game_type text, host_id uuid, host_display_name text, status text)
language sql
stable
security definer
set search_path = public
as $$
  select r.code, r.game_type, r.host_id, r.host_display_name, r.status
  from public.rooms r
  where r.code = upper(room_code);
$$;

revoke all on function public.room_by_code(text) from public;
grant execute on function public.room_by_code(text) to anon, authenticated;
