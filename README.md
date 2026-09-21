# Card Games

Four multiplayer card games in the browser — **Yaniv**, **Blackjack**, **Crazy Eights**
and **Go Fish**. Create a room, share the code, play in real time.

Built with Next.js (App Router), TypeScript, PartyKit for real-time state, and
Supabase for auth.

## Why it is built this way

The interesting constraint in a multiplayer card game is that **the client cannot be
trusted and the client cannot see everything**. A player must never learn what is in
another player's hand, and must never be able to play a card they do not hold.

That shapes the whole codebase:

- **Game rules are pure functions.** Every game lives in `lib/games/` with no I/O,
  no React and no network calls — scoring and legal-move predicates throughout, plus
  a `(state, action) -> state` reducer for the games played over the network
  (`applyAction` for Crazy Eights, `applyAsk` for Go Fish). `yaniv.ts` is 588 lines
  of rules and nothing else.
- **The server is authoritative.** `partykit/game-room.ts` owns the real state.
  Clients send *intents* (`{type: "ask", rank: "7"}`), never state. The room
  validates each action against the same pure reducer and broadcasts the result.
- **Each player gets a redacted view.** `publicStateFor(playerId)` projects the
  full state down to what that player is allowed to see — opponents' hands become
  counts, the deck becomes a number. The secret state never leaves the server.

Because the rules are pure, they are also trivial to test — 230 unit tests run
against them directly, with no mocking and no test doubles. Mocks appear only at the
edges, where a page test has to stub `next/navigation` under jsdom.

## Architecture

```
Browser (Next.js App Router, React)
   │   intents over WebSocket (partysocket)
   ▼
PartyKit room  ── partykit/game-room.ts     ← authoritative state, one room per game
   │   calls
   ▼
Pure rules     ── lib/games/{yaniv,blackjack,crazy-eights,go-fish}.ts
                                            ← no I/O, fully unit-tested

Supabase ── auth + session (@supabase/ssr), used only for identity
```

| Path | What lives there |
|------|------------------|
| `app/` | Routes: lobby, room create/join, one page per game |
| `lib/games/` | Pure rules + scoring, one module per game |
| `partykit/` | Authoritative real-time room server |
| `tests/` | Unit tests and scripted end-to-end probes |
| `scripts/` | Deploy with smoke-test and rollback |

## Running it

```bash
pnpm install
cp .env.example .env.local     # fill in Supabase + PartyKit values
pnpm dev                       # http://localhost:3000
npx partykit dev               # real-time server on :1999
```

Supabase credentials are only needed for sign-in. The game logic and its tests run
without any external service.

## Tests

```bash
pnpm test                 # 230 unit tests over the game rules
pnpm test:yaniv-edge      # edge-case probe against the room server

pnpm build                # the deploy-script tests need a production build first
pnpm test:deploy:yaniv    # deploy script's own test suite
```

The unit suite covers scoring, legal-move gating, turn order, deck handling and the
card-sorting and scoreboard helpers. `tests/e2e/` holds Playwright probes that drive a
running instance through the real rule paths in a browser — point them at any
deployment with `LIVE_BASE_URL` (they default to `http://127.0.0.1:3001`).

## Deploying

`scripts/deploy-yaniv.sh` builds **outside** the served directory, promotes the
finished build into place only once it is complete, smoke-tests the restarted
service, and rolls back automatically if the smoke test fails. The script has its
own test suite (`pnpm test:deploy:yaniv`) and a `--dry-run` mode.

## Status

Yaniv is the most developed game — full scoring, Assaf rules, turn timer and
scoreboard. Crazy Eights and Go Fish are playable over the real-time server.
Blackjack is single-player against the dealer.

## Licence

MIT — see [LICENSE](LICENSE).
