# Security

## Reporting a vulnerability

Please report it privately through GitHub's **Report a vulnerability** button on the Security tab
of this repository, not in a public issue. I aim to reply within a week.

## What the design protects

- **Hidden cards stay on the server.** In multiplayer rooms the room server keeps the full game
  state and sends each player only their own view: their hand, opponents' hand sizes and the size
  of the draw pile. Shuffles on the server use the platform's cryptographic random source.
- **Identity is signed, not claimed.** A player joins a room with a short-lived token that the
  Next.js server signs (HMAC-SHA256, `ROOM_TOKEN_SECRET`) from the Supabase session. The room
  ignores any identity a client asserts, sends nothing to sockets that have not joined, and drops
  malformed messages.
- **Secrets stay server-side.** Only the Supabase URL and anon key are public (`NEXT_PUBLIC_*`);
  access to data is governed by Supabase row-level security. `ROOM_TOKEN_SECRET` is server-only.

## Known limits

- The single-player games run entirely in the browser; their state is visible to that player's
  dev tools by design.
- `supabase/migrations/0001_initial_schema.sql` creates `games`, `game_players` and `game_moves`
  tables the app no longer uses; their row-level security is permissive. Don't apply that
  migration to a new project without dropping or locking down those tables. The `rooms` table is
  readable by anyone with the anon key, so room codes and host display names are not secret.
