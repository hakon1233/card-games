# Performance & bundle-size pass — 2026-06 (CAR-237)

Repo: `card-games` (Next.js 16.2.7 / React 19.2.4 / Turbopack). Sixth recurring
Quality-Loop perf pass (after CAR-153, CAR-172, CAR-193, CAR-209, CAR-223).
Baseline this run: `npx tsc --noEmit` → **clean (exit 0)**; `npm test` →
**200 passing** (25 files, ~1.0 s); `npm run lint` → **1 pre-existing error**
(`components/game/card-deck-control.tsx:61`, the deliberate hydration-safe deck read
documented in the CAR-172 doc, Note 1 — unchanged by this pass).

## What this pass did

Re-measured and re-audited the whole product surface. The **source tree (`app`,
`components`, `lib`, `next.config.ts`, `package.json`) is byte-identical to the
CAR-223 commit** (`git diff cc6abfc -- app components lib next.config.ts package.json`
→ empty) — no new routes, dependencies, timers, images, or network calls.

This pass **landed one clearly-safe win that prior passes could not**: a
provably-lossless re-compression of the PWA / favicon PNGs (the long-tracked
CAR-185). Earlier passes deferred it because no PNG optimizer
(`pngquant`/`oxipng`/`optipng`/`zopflipng`) was installed in the environment. This
run found that **`sharp` is now present** (it ships as a Next.js dependency), giving
a safe in-repo re-encode path.

## Shipped this run — CAR-185 (lossless PNG re-compression)

Re-encoded `public/*.png` with `sharp().png({ compressionLevel: 9, palette: false })`.
Verified **bit-for-bit pixel-identical** (decoded RGBA `Buffer.compare === 0` for every
file) before writing — i.e. zero visual change, dimensions and alpha preserved.
`palette: true`/`effort: 10` was rejected: it quantizes (max channel delta 8) and
could not be visually sign-off'd headlessly, so the lossless path was chosen.

| File | Before | After | Saved |
| --- | --- | --- | --- |
| `icon-512.png` | 110.2 KB | 92.6 KB | 17.6 KB |
| `icon-512-maskable.png` | 110.2 KB | 92.6 KB | 17.6 KB |
| `icon-192.png` | 26.1 KB | 23.3 KB | 2.8 KB |
| `icon-192-maskable.png` | 26.1 KB | 23.3 KB | 2.8 KB |
| `apple-touch-icon.png` | 23.8 KB | 21.8 KB | 2.0 KB |
| `icon-64.png` | 5.1 KB | 4.9 KB | 0.2 KB |
| `favicon-32.png` | 1.7 KB | 1.6 KB | 0.1 KB |
| `favicon-16.png` | 0.6 KB | 0.6 KB | — (skipped, not smaller) |
| **Total** | **~304 KB** | **~261 KB** | **~43 KB** |

Tests (200) and lint unchanged; only `public/*.png` bytes changed (`git diff --stat`
shows 7 binary files, 0 source lines). Fully reversible (git-tracked binaries).

Note on remaining headroom: a lossy palette re-encode would cut the `icon-512*` pair a
further ~80 KB (to ~52 KB each) at max channel delta ≤8 — imperceptible but not
bit-lossless. That is **not shipped** here because it needs a visual check of the
maskable safe-zones that can't be done in this headless run. Captured on CAR-185.

## Measurements (this run)

- **Static JS shipped:** ~1.0 MB across `.next/static/chunks`. Three largest chunks
  (233 KB + 151 KB + 113 KB) are framework/vendor (React/Next runtime), shared across
  routes. App code is small and per-route — no oversized app dependency to split.
- **Hot-path timers:** Only the two countdown clocks in `app/play/yaniv/page.tsx`
  (quick-draw @50 ms line 446; per-turn @100 ms line 518). Both already tracked
  (CAR-160 / CAR-182). The sole `requestAnimationFrame` (line 1387/1389) is a
  self-terminating animation, not a steady loop.
- **Largest client component:** `app/play/yaniv/page.tsx` — 2033 lines, owns the live
  game UI and all per-render derived work. Re-render cost during ticks tracked
  (CAR-160 / CAR-182 / CAR-183).
- **Network / N+1 / waterfalls:** `app/games/[id]/page.tsx` opens one PartySocket and
  fires the initial-state `fetch` in parallel effects (no waterfall). Yaniv vs-bot API
  uses an in-memory `Map` store — no DB round-trips, no N+1. No raw `<img>` anywhere;
  the only `next/image` use (`brand-logo.tsx`) sets `width`/`height`/`priority`.

## Already tracked — verified OPEN, not re-filed (per guardrail)

| Finding | Open issue | Status verified this run |
| --- | --- | --- |
| Isolate per-turn countdown (10 Hz full-page re-render) | CAR-182 | todo |
| Isolate turn-clock & quick-draw countdowns (broader extraction) | CAR-160 | backlog |
| Stabilize `toShellCard()` so `PlayingCard` `React.memo` bails out | CAR-183 | todo |
| Re-compress PWA icons — further lossy headroom only | CAR-185 | updated (lossless pass landed; lossy follow-up needs visual sign-off) |

Partial mitigations already landed previously: `PlayingCard` wrapped in `React.memo`
(CAR-172); room-page Supabase round-trips parallelized (CAR-184, closed).

## Re-audit — confirmed clean / no new finding

- **Bundle / barrel imports:** `lucide-react` uses named imports and is in Next 16's
  default `optimizePackageImports` list (auto tree-shaken); `@base-ui` is imported via
  deep path. No barrel bloat; no safe code-split win at current app size.
  `next.config.ts` is intentionally empty — adding `optimizePackageImports` would be a
  no-op given the defaults.
- **Assets:** Icon PNGs re-compressed losslessly this run (above). No other oversized
  asset.

## Disposition

Verified green (tsc clean, 200 tests, lint unchanged at the one pre-existing error).
Landed a clearly-safe, provably-lossless ~43 KB icon-payload reduction (CAR-185
path). All remaining needle-moving items stay covered by open issues
CAR-160 / CAR-182 / CAR-183 / CAR-185 (statuses confirmed this run). Pass complete.
