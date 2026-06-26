# Performance & bundle-size pass — 2026-06 (CAR-193)

Repo: `card-games` (Next.js 16.2.7 / React 19.2.4 / Turbopack). Third recurring
Quality-Loop perf pass (after CAR-153 and CAR-172). Baseline this run: `npm test` →
**200 passing**, `npx tsc --noEmit` → clean, `npm run lint` → 1 **pre-existing**
error (`components/game/card-deck-control.tsx:58`, deliberate hydration-safe deck
read — see CAR-172 doc Note 1).

## What this pass did

Most needle-moving findings were already surfaced and **tracked by open issues** from
the two prior passes, so this pass focused on (a) closing a clearly-safe win directly
and (b) re-auditing for anything new. No new unfiled finding was found — the app is
small and the prior passes were thorough.

### Fixed directly (small, clearly-safe, reversible)

- **`app/rooms/[code]/page.tsx` — parallelized the two sequential Supabase
  round-trips.** The page awaited `auth.getUser()` and *then* the `rooms` select,
  even though the room lookup does not depend on the user. Wrapped both in
  `Promise.all`, keeping the unauthenticated redirect and the `notFound()` on a
  missing room identical. Removes one RTT from the room-page TTFB on the authenticated
  common path. Closes **CAR-184**. (tsc clean, 200 tests green, lint unchanged.)

## Already tracked — not re-filed (per guardrail)

| Finding | Open issue |
| --- | --- |
| Isolate per-turn countdown (10 Hz full-page re-render) | CAR-182 / CAR-160 |
| Isolate quick-draw countdown (20 Hz re-render) | CAR-160 |
| Stabilize `toShellCard()` so `PlayingCard` memo bails out | CAR-183 |
| Re-compress oversized PWA icon PNGs (`icon-512*` ~112 KB each) | CAR-185 |

Partial mitigation already shipped in CAR-172: `PlayingCard` is wrapped in
`React.memo`.

## Re-audit — confirmed clean / no new finding

- **Network / N+1 / waterfalls:** Only the room-page waterfall (now fixed). The Yaniv
  vs-bot API (`app/api/yaniv/[id]/action/route.ts`) uses an in-memory `Map` store
  (`lib/yaniv-store.ts`) — no DB round-trips, no N+1. The bot-turn `while` loop is
  synchronous and bounded by player count. `lobby-client` realtime is over a single
  PartySocket connection (no polling).
- **Hot-path timers:** The only `setInterval`s are the two countdown clocks in
  `app/play/yaniv/page.tsx` (lines 446, 518) — both already tracked (CAR-160/-182).
- **Bundle:** Unchanged from CAR-172 — ~933 KB static JS dominated by framework/vendor
  chunks; app code is small and per-route. No safe, needle-moving code-split available
  at current size.
- **Assets:** No reliable lossless PNG re-encoder available in this environment
  (`pngquant`/`oxipng`/`optipng` absent; only `sips`, which is not byte-safe), so the
  icon re-compression is deliberately left to its dedicated issue CAR-185 rather than
  risk an uncertain re-encode.

## Disposition

One clearly-safe win fixed and its issue closed (CAR-184). All remaining items remain
covered by open issues CAR-160, CAR-182, CAR-183, CAR-185. Nothing new to file.
