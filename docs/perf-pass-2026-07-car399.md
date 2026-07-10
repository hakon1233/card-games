# Performance & bundle-size pass — 2026-07 (CAR-399)

Repo: `card-games` (Next.js 16.2.7 / React 19.2.4 / Turbopack). Recurring
Quality-Loop perf pass, tenth in the series (after CAR-153, CAR-172, CAR-193,
CAR-209, CAR-223, CAR-237, CAR-255, CAR-275, plus the CAR-182/183/184 fixes).

Baseline this run (all measured fresh):
- `npx tsc --noEmit` → **clean (exit 0)**
- `npx vitest run` → **207 passing** (27 files, ~1.5 s)
- `npm run lint` → **0 errors**, 8 pre-existing warnings, all `no-unused-vars`
  in `tests/e2e/*.mjs` driver scripts (unrelated to app code / perf). The
  `card-deck-control.tsx` lint error noted in the CAR-255 pass is gone — fixed
  by an unrelated hydration commit since then.
- `NODE_ENV=production npx next build` → **green**, 17 routes generated. The
  `/_global-error` Turbopack prerender failure recorded in a prior session's
  notes did **not** reproduce on this run; treating that as resolved upstream
  rather than a live guardrail concern.

## What this pass did

**Source drift since the last pass (CAR-275 @ `3c435f1`): none.** `git log`
and `git diff 3c435f1 HEAD --stat` are both empty — no commits have landed in
this repo in the 13 days since CAR-275. Re-ran the full audit from scratch
rather than assume the prior findings still hold, and additionally widened
coverage to the three games the last few passes spent less time on
(Blackjack, Crazy Eights, Go Fish), since most historical findings concentrated
on Yaniv.

## Measurements (this run)

- **Static JS shipped:** 1.4 MB under `.next/static`, ~1.1 MB of that in
  `.next/static/chunks`. The three largest chunks are unchanged byte-for-byte
  in shape from CAR-255/CAR-275: 228 KB / 148 KB / 112 KB raw (72.6 / 40.7 /
  39.5 KB gzip) — framework/vendor (React 19 + Next runtime), shared across
  every route. No oversized app-owned chunk.
- **Non-Yaniv game pages:** `app/play/blackjack/page.tsx` (185 lines),
  `app/play/crazy-eights/page.tsx` (554 lines), `app/play/go-fish/page.tsx`
  (415 lines) — all single-player-vs-bot with game state held entirely
  client-side. **No `fetch` calls in any of the three** (grepped for
  `fetch(`) — there is no network waterfall to isolate because there is no
  network round-trip per move. No `setInterval`/`requestAnimationFrame` in
  any of them either (grepped across `app/`, `components/`, `lib/`) — the
  only ticking timers in the whole product remain the two in
  `app/play/yaniv/page.tsx`.
- **Shared card rendering:** `PlayingCard` (`components/game/card.tsx`) is
  the only `React.memo`'d component and it's the single card-render path
  used by `CardHand` for all four games (confirmed via `card-hand.tsx`), so
  the CAR-172 memoization win already covers Blackjack/Crazy Eights/Go Fish,
  not just Yaniv.
- **Bot / game-logic hot paths:** `lib/games/*.ts` and `lib/bots/*.ts` are
  small (78–558 lines) and only sort/filter hand-sized arrays (≤ ~15 cards
  per player); no nested loops over unbounded data, no
  `JSON.parse(JSON.stringify(...))` deep-clone antipattern anywhere in
  `lib/`, `app/`, or `components/`.
- **Dependencies:** `@supabase/ssr`'s `createBrowserClient` is the only
  Supabase import reaching client code (`lib/supabase/client.ts`); the full
  `@supabase/supabase-js` client is server-only (`lib/supabase/server.ts`).
  `lucide-react` (5 import sites) stays in Next 16's default
  `optimizePackageImports` list. `next.config.ts` is still intentionally
  empty — no config change would move the needle here.
- **Assets:** `public/` is unchanged at 340 KB; icons remain at their
  CAR-237 lossless-compressed sizes. No new image added since the last pass.

## Already tracked — verified, not re-filed (per guardrail)

| Finding | Open issue | Status verified this run |
| --- | --- | --- |
| Isolate the Yaniv quick-draw 50 ms countdown (`qdTimeLeft`) off the page-root `useState` — it still re-renders the full `YanivPage` return tree (hand, action buttons, quick-draw badge) ~20×/sec for the 2 s quick-draw window | CAR-160 | backlog, unassigned |

Re-checked the actual isolation cost this run rather than taking the prior
notes at face value: `qdTimeLeft` (`app/play/yaniv/page.tsx:267`) is
top-level state, and its derived `qdTimerLabel`/`qdProgress`
(lines 728–729) are consumed both inside `<TurnCountdown>` (via
`PlayerRing` → `QuickDrawPile`, lines 773–799) **and** in a sibling
`qdActive` badge block outside that wrapper (lines 917–932). A CAR-182-style
fix needs a context that spans both regions and also relocates the
`QUICK_DRAW_EXPIRE` dispatch (currently in the page-level interval, around
lines 454–475) into the new leaf owner — a materially larger, multi-region
change to the hottest file in the app, not a same-day drop-in. That is
exactly the shape of change CAR-160 exists for; kept as one tracked item
rather than splitting or partially patching it in this pass. (Line numbers
reflect HEAD after rebasing onto concurrent GAM-110/115/157 commits that
landed on `main` mid-pass — same structure, no material shift.)

## Re-audit — confirmed clean / no new finding

- No source changes since CAR-275 to introduce regressions.
- No N+1/waterfall network calls in any of the four games or their API
  routes; Blackjack/Crazy Eights/Go Fish have no network calls at all
  (pure client + bot), Yaniv's vs-bot API is an in-memory `Map` store, and
  the room page's Supabase calls stay parallelized (CAR-184).
- No new oversized asset, dependency, or heavy synchronous main-thread work.
- Build/typecheck/lint/test all green; the previously-tracked pre-existing
  lint error is gone (fixed by an unrelated commit) and the previously-noted
  `/_global-error` prerender build failure did not reproduce.

## Disposition

Verified green end-to-end (tsc clean, 207 tests, lint 0 errors, production
build green). No source drift since CAR-275 and no new clearly-safe win to
land — this pass's only change is this findings doc. The one needle-moving
item remains **CAR-160** (backlog, unassigned), now independently
re-confirmed rather than carried forward from memory. No new issue filed —
nothing surfaced beyond what CAR-160 already tracks.
