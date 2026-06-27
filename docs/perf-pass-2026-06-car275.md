# Performance & bundle-size pass - 2026-06 (CAR-275)

Quality-Loop perf pass after CAR-255 and the CAR-182 countdown isolation.

## What this pass did

Re-measured the app after the latest perf commits and checked for new regressions in:

- bundle/static asset size
- client-side timer re-render hot paths
- Supabase/API waterfalls
- repeated render allocations around card rendering
- oversized public assets

The main source changes since CAR-255 are the landed CAR-182 fix in
`app/play/yaniv/page.tsx` and this pass's one-line font payload reduction in
`app/layout.tsx`.

## Fixed directly - unused display font weights

`app/layout.tsx` loaded Playfair Display weights `400`, `700`, and `900`, but every
actual `font-heading` use in the app also applies `font-bold`; no `font-heading`
selector uses regular, black, or explicit `900` weight. This pass now requests only
the used `700` weight.

Measured effect from clean production builds:

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| `.next/static/media` WOFF2 bytes | 247,872 | 212,672 | -35,200 raw bytes |
| Production build | green | green | no route changes |

The prior attempt to remove only `900` measured no emitted-font reduction, so it was
not kept.

## Measurements (this run)

- `npm run build` green. Next 16/Turbopack compiled successfully, typechecked, and
  generated 17 app routes.
- Largest emitted client/static chunks after the fix:
  - `26leodf0a3dzz.js`: 227 KB raw / 72.6 KB gzip
  - `2n289xika7fjr.js`: 148 KB raw / 40.7 KB gzip
  - `0cz1d0mv5g_q7.js`: 110 KB raw / 39.5 KB gzip
  - CSS chunk: 75 KB raw after the font reduction
- Yaniv page server chunk remains small: `app_play_yaniv_page_tsx...js` is about
  47 KB raw / 14.6 KB gzip.
- Public icon PNGs remain at the CAR-185 lossless-compressed sizes:
  `icon-512*` about 94.8 KB each, `icon-192*` about 23.9 KB each.

## Already tracked - not re-filed

| Finding | Open issue | Status verified this run |
| --- | --- | --- |
| Broader Yaniv timer extraction, especially quick-draw's 50 ms page-level tick | CAR-160 | backlog |

Previously tracked items are now closed: CAR-182 (per-turn countdown leaf isolation),
CAR-183 (`toShellCard()` identity stabilization), CAR-184 (room Supabase round-trip
parallelization), and CAR-185 (lossless icon re-compression).

## Re-audit notes

- CAR-182 moved the 100 ms per-turn countdown into `TurnCountdown`, with only
  `LiveTurnCountdownRing` and `LiveTurnSeconds` consuming the ticking context.
- The quick-draw 50 ms timer is still page-level state (`qdTimeLeft`), but it is
  already covered by CAR-160 and should be handled there rather than split into a
  duplicate follow-up.
- `app/rooms/[code]/page.tsx` still issues auth and room lookup concurrently via
  `Promise.all`; no room-page waterfall regression found.
- Card rendering still has `React.memo` on `PlayingCard` and memoized shell-card
  conversion in the hot Yaniv scoreboard / quick-draw paths.

## Disposition

Landed one small, reversible bundle-size win: remove unused Playfair Display regular
and black weights from the global font request. No new follow-up issue was opened
because the only remaining needle-moving runtime item is already tracked by CAR-160.
