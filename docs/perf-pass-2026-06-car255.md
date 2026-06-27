# Performance & bundle-size pass — 2026-06 (CAR-255)

Repo: `card-games` (Next.js 16.2.7 / React 19.2.4 / Turbopack). Seventh recurring
Quality-Loop perf pass (after CAR-153, CAR-172, CAR-193, CAR-209, CAR-223, CAR-237).

Baseline this run (all measured fresh):
- `npx tsc --noEmit` → **clean (exit 0)**
- `npm test` → **200 passing** (25 files, ~0.97 s)
- `npm run lint` → **1 pre-existing error** (`components/game/card-deck-control.tsx:58`,
  `react-hooks/set-state-in-effect`) — the deliberate hydration-safe deck read
  documented in the CAR-172 pass; unchanged by this pass.

## What this pass did

Re-measured and re-audited the whole product surface against the open-issue backlog.

**Source drift since the last pass (CAR-237 @ `17e7dbd`):** only
`app/play/yaniv/page.tsx` changed — the **CAR-183** toShellCard stabilization
(`24c073c`, current HEAD: +11/-4). No new routes, dependencies, timers, images, or
network calls. Working tree is clean (the only untracked file is `package-lock.json`,
which is **not** this repo's lockfile — the repo uses `pnpm-lock.yaml` — so it was
deliberately left untouched and uncommitted).

Net: nothing new to safely land this run, and nothing new to file — every
needle-moving item is already covered by an open issue (table below). No change was
manufactured for its own sake (guardrail: small, clearly-safe wins only).

## Measurements (this run)

- **Static JS shipped:** ~1.0 MB across `.next/static/chunks` (996 KB total under
  `.next/static`). Three largest chunks (228 KB + 148 KB + 112 KB) are
  framework/vendor (React/Next runtime), shared across all routes — essentially
  identical to CAR-237 (233/151/113). App code is small and per-route; no oversized
  app dependency to split.
- **Hot-path timers:** Only the two countdown clocks in `app/play/yaniv/page.tsx`
  (quick-draw ~50 ms; per-turn ~100 ms). Both tracked (CAR-160 / CAR-182). The sole
  `requestAnimationFrame` is a self-terminating animation, not a steady loop.
- **Largest client component:** `app/play/yaniv/page.tsx` (~2040 lines) owns the live
  game UI and per-render derived work. Re-render cost during ticks tracked
  (CAR-160 / CAR-182); `PlayingCard` is `React.memo`'d (CAR-172) with a stabilized
  `toShellCard()` (CAR-183, landed since last pass).
- **Network / N+1 / waterfalls:** `app/games/[id]/page.tsx` opens one PartySocket and
  fires the initial-state `fetch` in parallel effects (no waterfall). Yaniv vs-bot API
  (`app/api/yaniv/[id]/action/route.ts`) uses an in-memory `Map` store — no DB
  round-trips, no N+1. Room page Supabase round-trips were parallelized (CAR-184,
  closed). No raw `<img>`; the only `next/image` use (`brand-logo.tsx`) sets
  `width`/`height`/`priority`.
- **Conditionally-loaded code:** `YanivBot` (153 lines) is module-scope instantiated
  and used on every yaniv-page load (single-player is always vs-bot, default
  `numBots: 1`) — not a code-split candidate. Other bots are imported only by their
  own routes/APIs. No statically-imported-but-conditionally-used heavy module found.
- **Assets:** PWA/favicon PNGs were losslessly re-compressed in CAR-237 (~43 KB saved,
  pixel-identical). `public/` totals 340 KB; no oversized asset.

## Already tracked — verified, not re-filed (per guardrail)

| Finding | Open issue | Status verified this run |
| --- | --- | --- |
| Isolate Yaniv turn-clock & quick-draw countdowns (stop 10–20 Hz re-render of the 2040-line YanivPage) | CAR-160 | backlog |
| Isolate Yaniv per-turn countdown to stop 10 Hz full-page re-renders | CAR-182 | in_progress |
| Lossy palette re-encode of `icon-512*` (~80 KB further headroom) — needs a visual sign-off of maskable safe-zones, not doable headlessly | (icon-optimization item, CAR-185 lineage) | deferred — visual check required |

Landed since the previous pass: **CAR-183** (`toShellCard()` stabilized so
`PlayingCard`'s `React.memo` bails out on clock ticks) — `24c073c`.

## Re-audit — confirmed clean / no new finding

- **Bundle / barrel imports:** `lucide-react` uses named imports and is in Next 16's
  default `optimizePackageImports` list (auto tree-shaken); `@base-ui/react` is
  imported via deep path. No barrel bloat. `next.config.ts` is intentionally empty —
  adding `optimizePackageImports` would be a no-op given the defaults.
- **Code-splitting:** no oversized or conditionally-used app module to split at the
  current app size.
- **Assets:** already optimized; only the lossy icon headroom remains (deferred,
  needs visual sign-off).

## Disposition

Verified green (tsc clean, 200 tests, lint unchanged at the one pre-existing error).
Source is unchanged since the last pass apart from the committed CAR-183 fix; bundle
and assets are unchanged. No new clearly-safe win to land and nothing new to file —
all needle-moving items stay covered by open issues **CAR-160** (backlog) and
**CAR-182** (in_progress), with the lossy-icon headroom deferred pending a visual
check. Pass complete.
