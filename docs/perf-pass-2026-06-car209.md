# Performance & bundle-size pass — 2026-06 (CAR-209)

Repo: `card-games` (Next.js 16.2.7 / React 19.2.4 / Turbopack). Fourth recurring
Quality-Loop perf pass (after CAR-153, CAR-172, CAR-193). Baseline this run:
`npx tsc --noEmit` → **clean**; `npm test` → **200 passing** (25 files);
`npm run lint` → **1 pre-existing error** (`components/game/card-deck-control.tsx:58`,
the deliberate hydration-safe deck read documented in the CAR-172 doc, Note 1).

## What this pass did

Re-measured and re-audited the whole product surface for new regressions. The
codebase is **materially unchanged since CAR-193** (same source files, same static
JS chunk sizes, same assets — no new routes, deps, timers, or images). Every
needle-moving finding from the prior passes is still covered by an **open** issue,
and the one safe win each prior pass had to ship is already shipped. This pass found
**no new, unfiled finding** and **no new clearly-safe win** that isn't either already
landed or owned by an open issue, so — per the "don't re-file / keep changes that move
the needle" guardrail — it ships no code change beyond this findings doc.

## Measurements (this run)

- **Static JS shipped:** ~1.0 MB across `.next/static/chunks`. Three largest chunks
  (233 KB + 151 KB + 113 KB) are framework/vendor (React/Next runtime), shared across
  routes. App code is small and per-route — no oversized app dependency to split.
- **Hot-path timers:** Only two `setInterval`s in the app, both the countdown clocks
  in `app/play/yaniv/page.tsx` (quick-draw @50 ms line 446; per-turn @100 ms line 518).
  Both already tracked (CAR-160 / CAR-182). The only `requestAnimationFrame`
  (line 1387) is a self-terminating animation (`if (t < 1) raf = …`), not a steady loop.
- **Largest assets:** `icon-512.png` / `icon-512-maskable.png` — 112 KB each
  (225 KB combined); PWA install icons only, off the initial-paint path. Tracked
  (CAR-185).
- **Largest client component:** `app/play/yaniv/page.tsx` — 2033 lines, owns the live
  game UI and all per-render derived work. Re-render cost during ticks tracked
  (CAR-182 / CAR-183).

## Already tracked — verified OPEN, not re-filed (per guardrail)

| Finding | Open issue | Status verified |
| --- | --- | --- |
| Isolate per-turn countdown (10 Hz full-page re-render; incl. per-tick `getYanivScoreboardRows` / `getYanivHandReadout` / `describeSelection` / `getFinalStandings`) | CAR-182 | todo |
| Isolate quick-draw countdown (20 Hz re-render) | CAR-160 | backlog |
| Stabilize `toShellCard()` so `PlayingCard` `React.memo` bails out | CAR-183 | todo |
| Re-compress oversized PWA icon PNGs (`icon-512*` ~112 KB each) | CAR-185 | todo |

Partial mitigations already landed: `PlayingCard` wrapped in `React.memo` (CAR-172);
room-page Supabase round-trips parallelized (CAR-184, closed).

## Re-audit — confirmed clean / no new finding

- **Bundle / barrel imports:** `lucide-react` uses named imports and is in Next 16's
  default `optimizePackageImports` list (auto tree-shaken); `@base-ui` is imported via
  deep path (`@base-ui/react/button`). No barrel bloat; no safe code-split win at
  current app size. `next.config.ts` is intentionally empty — adding
  `optimizePackageImports` would be a no-op given the defaults.
- **Network / N+1 / waterfalls:** `app/games/[id]/page.tsx` opens one PartySocket and
  fires the initial-state `fetch` in parallel effects (no waterfall). Yaniv vs-bot API
  uses an in-memory `Map` store — no DB round-trips, no N+1. No raw `<img>` anywhere;
  the only `next/image` use (`brand-logo.tsx`) sets `width`/`height`/`priority`.
- **Assets:** No lossless PNG re-encoder available in this environment
  (`pngquant` / `oxipng` / `optipng` / `zopflipng` all absent), so icon re-compression
  stays with its dedicated issue CAR-185 rather than risk an uncertain re-encode.

## Disposition

Verified green (tsc clean, 200 tests, lint unchanged at the one pre-existing error).
All needle-moving items remain covered by open issues CAR-160 / CAR-182 / CAR-183 /
CAR-185 (statuses confirmed this run). Nothing new to fix or file. Pass complete.
