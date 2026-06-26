# Performance & bundle-size pass — 2026-06 (CAR-172)

Repo: `card-games` (Next.js 16.2.7 / React 19.2.4 / Turbopack). Recurring Quality-Loop
audit. Baseline measured on this run: `npm test` → 200 passing, `npm run build` →
compiles clean, `npm run lint` → 1 **pre-existing** error (see Note 1).

## Measurements

- **Static JS shipped:** ~933 KB total across `.next/static/chunks`. Three largest
  chunks (232 KB + 151 KB + 112 KB) are framework/vendor (React/Next runtime), shared
  across routes. App-specific code is small and per-route — no oversized app dependency
  worth splitting.
- **Largest source file / hottest client component:** `app/play/yaniv/page.tsx` —
  2033 lines, a single `"use client"` component that owns the entire live game UI.
- **Largest assets:** `public/icon-512.png` and `icon-512-maskable.png` — 112 KB each
  (225 KB combined); `icon-192*.png` — 27 KB each. PWA install icons only; not on the
  initial paint path.

## Prioritized findings

### 1. [High] 10 Hz full-tree re-render of the Yaniv page during every turn
`app/play/yaniv/page.tsx:518` runs `setInterval(…, 100)` for the per-turn countdown,
calling `setTurnTimeLeft()` ~10×/second. Each tick re-renders the whole 2033-line
component — every hand, the table ring, the scoreboard, and all per-render derived
work (`getYanivScoreboardRows`, `getYanivHandReadout`, `describeSelection`,
`getFinalStandings`). The only thing that actually changes per tick is the countdown
ring fill + the "Ns" number.
**Fix direction:** isolate the countdown into a small child component that owns its own
timer/state, so a tick re-renders only the ring, not the table. Reversible, no UX change.
→ filed as a fix-issue.

### 2. [Med] `toShellCard()` allocates fresh card objects in render
At `app/play/yaniv/page.tsx:1530` and `:1939`, cards are passed as
`card={toShellCard(card)}` — a new object each render. This both churns GC under the
10 Hz clock and defeats `React.memo` on `PlayingCard` at those sites (new reference every
render). **Fix:** memoize/stabilize the converted cards (e.g. `useMemo` over the source
arrays). → filed as a fix-issue.

### 3. [Med] Sequential Supabase round-trips (waterfall) on the room page
`app/rooms/[code]/page.tsx:13-25` awaits `auth.getUser()` then the `rooms` select
sequentially, though the room query does not depend on the user. Two RTTs where the
authenticated common path could do one. **Fix:** parallelize (`Promise.all`), keeping the
unauthenticated redirect. Small, reversible. → filed as a fix-issue.

### 4. [Low] Oversized PWA icon PNGs
`icon-512*.png` are 112 KB each. Lossless re-encode (oxipng/pngquant) typically cuts
40-60%. Off the initial-paint path (install-only), so low priority. → filed as a fix-issue.

## Fixed directly this pass (small, clearly-safe, reversible)

- **`components/game/card.tsx` — `PlayingCard` wrapped in `React.memo`.** It is a pure
  presentational component (no hooks, no side effects); output is a function of
  `card` + `size` only. Memoizing lets cards with stable identity (hand cards, sourced
  from game state) skip re-render during the 10 Hz countdown ticks. Output is byte-for-byte
  identical (200 tests still green). This is a partial mitigation for finding #1; finding
  #2 must land for the page.tsx call sites to benefit too.

## Notes / deliberately not actioned

- **Note 1 — pre-existing lint error:** `components/game/card-deck-control.tsx:58`
  (`react-hooks/set-state-in-effect`) is a deliberate hydration-safe deck read
  (commits GAM-87/-94). It predates this pass; left untouched to keep the change small.
- **Bundle:** no unsafe-to-defer heavy dependency found; framework chunks dominate.
  No code-split win that is both safe and needle-moving at current app size.
