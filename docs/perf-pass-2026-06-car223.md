# Performance & bundle-size pass — 2026-06 (CAR-223)

Repo: `card-games` (Next.js 16.2.7 / React 19.2.4 / Turbopack). Fifth recurring
Quality-Loop perf pass (after CAR-153, CAR-172, CAR-193, CAR-209). Baseline this run:
`npx tsc --noEmit` → **clean (exit 0)**; `npm test` → **200 passing** (25 files,
~0.9 s); `npm run lint` → **1 pre-existing error** (`components/game/card-deck-control.tsx:58`,
the deliberate hydration-safe deck read documented in the CAR-172 doc, Note 1).

## What this pass did

Re-measured and re-audited the whole product surface. The source tree is
**byte-identical to the CAR-209 commit** (`git diff --stat ef92051 -- app components
lib public next.config.ts package.json` → empty; HEAD is still the CAR-209 doc commit).
No new routes, dependencies, timers, images, or network calls have landed since the
last pass. Every needle-moving finding from the prior passes remains covered by an
**open** issue (statuses re-verified this run), and no new clearly-safe win is
available in this environment. Per the "don't re-file / keep changes that move the
needle" guardrail, this pass ships **no code change** beyond this findings doc.

## Measurements (this run)

- **Static JS shipped:** ~955 KB across `.next/static/chunks`. Three largest chunks
  (233 KB + 151 KB + 113 KB) are framework/vendor (React/Next runtime), shared across
  routes. App code is small and per-route — no oversized app dependency to split.
- **Hot-path timers:** Only the two countdown clocks in `app/play/yaniv/page.tsx`
  (quick-draw @50 ms; per-turn @100 ms). Both already tracked (CAR-160 / CAR-182).
  The sole `requestAnimationFrame` is a self-terminating animation, not a steady loop.
- **Largest assets:** `icon-512.png` / `icon-512-maskable.png` — 112 KB each
  (225 KB combined); PWA install icons only, off the initial-paint path. Tracked
  (CAR-185). `icon-192*` 27 KB each; `apple-touch-icon.png` 24 KB.
- **Largest client component:** `app/play/yaniv/page.tsx` — 2033 lines, owns the live
  game UI and all per-render derived work. Re-render cost during ticks tracked
  (CAR-182 / CAR-183 / CAR-160).

## Already tracked — verified OPEN, not re-filed (per guardrail)

| Finding | Open issue | Status verified this run |
| --- | --- | --- |
| Isolate per-turn countdown (10 Hz full-page re-render; incl. per-tick `getYanivScoreboardRows` / `getYanivHandReadout` / `describeSelection` / `getFinalStandings`) | CAR-182 | todo |
| Isolate turn-clock & quick-draw countdowns (broader extraction) | CAR-160 | backlog |
| Stabilize `toShellCard()` so `PlayingCard` `React.memo` bails out | CAR-183 | todo |
| Re-compress oversized PWA icon PNGs (`icon-512*` ~112 KB each) | CAR-185 | todo |

Partial mitigations already landed: `PlayingCard` wrapped in `React.memo` (CAR-172);
room-page Supabase round-trips parallelized (CAR-184, closed).

## Re-audit — confirmed clean / no new finding

- **Bundle / barrel imports:** `lucide-react` uses named imports and is in Next 16's
  default `optimizePackageImports` list (auto tree-shaken); `@base-ui` is imported via
  deep path. No barrel bloat; no safe code-split win at current app size.
  `next.config.ts` is intentionally empty.
- **Network / N+1 / waterfalls:** `app/games/[id]/page.tsx` opens one PartySocket and
  fires the initial-state `fetch` in parallel effects (no waterfall). Yaniv vs-bot API
  uses an in-memory `Map` store — no DB round-trips, no N+1. No raw `<img>`; the only
  `next/image` use (`brand-logo.tsx`) sets `width`/`height`/`priority`.
- **Assets:** No lossless PNG re-encoder available in this environment
  (`pngquant` / `oxipng` / `optipng` / `zopflipng` all absent, re-confirmed this run),
  so icon re-compression stays with its dedicated issue CAR-185 rather than risk an
  uncertain re-encode.

## Disposition

Verified green (tsc clean, 200 tests, lint unchanged at the one pre-existing error).
All needle-moving items remain covered by open issues CAR-160 / CAR-182 / CAR-183 /
CAR-185 (statuses confirmed this run). Source unchanged since CAR-209; nothing new to
fix or file. Pass complete.
