<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Card Games — agent notes

Four browser card games against bots (Yaniv, Blackjack, Crazy Eights, Go Fish) plus multiplayer
rooms that stop at the lobby. Domain words: `CONTEXT.md`. Module map and data flow:
`ARCHITECTURE.md`. Decisions: `docs/adr/`.

## Commands

- `pnpm check` — typecheck, lint, unit tests, build. The gate before every commit; there is no CI.
- `pnpm build && pnpm test:e2e` — headless Playwright smoke test on port 7121.
- `pnpm dev` + `pnpm dev:party` — app on :3000, PartyKit room server on :1999.

## Where to work

| Asked to change… | Work in |
|---|---|
| A game's rules | `lib/games/<game>.ts`; its tests sit beside it, plus the four-engine contract suite `lib/games/engine.test.ts` |
| How bots take turns | `lib/games/bot-turns.ts`; a bot's choices: `lib/bots/<game>-bot.ts` |
| A game's table UI | `app/play/<game>/` (Yaniv is split by concept: session, feedback, settings, components) |
| Multiplayer rooms | `partykit/game-room.ts` (server), `lib/room-token.ts` (identity), `app/rooms/` (lobby) |
| Shared card UI | `components/game/` |

## Rules of the codebase

- Rules engines stay pure: no React, I/O or `Math.random`. Randomness comes in as an `Rng`
  argument; tests pass `seededRng(n)`, the room server passes `cryptoRng`.
- Every engine exports `deal`, `apply`, `playerView`, `activePlayer` (`RulesEngine` in
  `lib/games/engine.ts`). An illegal action returns the same state object.
- The room server trusts identity only from a verified room token, and sends each player only
  `playerView` for that player. Keep both when adding messages.
- Unit tests live next to their module as `*.test.ts(x)`; Playwright specs live in `tests/e2e/`.
