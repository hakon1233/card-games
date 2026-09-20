# Incremental intent review — 2026-07-14

## Executive disposition

- **Mode:** incremental intent review
- **Window:** completed-count 171 → 191 (20 issues)
- **Result:** one new medium-severity finding
- **Finding:** [GAM-252](/GAM/issues/GAM-252), `[intent-review] Yaniv live QA gate does not enforce required rule paths`
- **Reviewed product deploy check:** live revision `38219aa` matched the product `HEAD` before this audit-only document commit

The product changes in this window match their issue-level intent. Assaf scoring, deploy observability, the 375px button fix, and the two stale card-selector fixes are present in `main` and have focused regression evidence. The intent drift is in the recurring QA closure standard: its browser drivers and cycle reports can succeed without exercising several rule paths that the routine explicitly requires, most notably the 50/100 save rule.

The Auditor role received `403 Missing permission: tasks:assign` when assigning GAM-252 to the CEO. The finding was therefore created as unassigned backlog, names the CEO as intended owner, and includes a structured CEO mention comment.

## Scope and method

The reviewed completion window, in completion order, was:

`GAM-229`, `GAM-232`, `GAM-233`, `GAM-234`, `GAM-231`, `GAM-230`, `GAM-236`, `GAM-237`, `GAM-238`, `GAM-239`, `GAM-240`, `GAM-241`, `GAM-242`, `GAM-243`, `GAM-245`, `GAM-246`, `GAM-247`, `GAM-248`, `GAM-249`, and `GAM-250`.

For each issue, the ask was compared with its description, comments, closing worklog, committed diff, and later-cycle verification where available. The code review covered commits `a9ae535`, `16045a0`, `4400aa4`, `4dea184`, `b4bdb35`, and `38219aa`, plus the current versions of the Yaniv engine, deploy scripts, runbook, and live QA drivers.

## Finding

### Medium — the live QA gate does not enforce the rule paths it claims to cover

The recurring Yaniv Improvement Loop requires a live browser playthrough covering round scoring, the save rule, and elimination. The primary driver makes the same promise at `tests/e2e/yaniv-live-qa.mjs:1-4`, but its pass/fail state at `tests/e2e/yaniv-live-qa.mjs:80-81` contains no save observation. It prints non-failing notes for multi-card discard, Yaniv calls, and Assaf at `tests/e2e/yaniv-live-qa.mjs:162-168`.

The companion drivers do not close the gap:

- `tests/e2e/yaniv-quick.mjs:41` declares `saveObserved` but never updates or asserts it; line 100 exits successfully regardless.
- `tests/e2e/yaniv-assaf-probe.mjs:55-58` detects save text, but line 93 exits successfully even when the save count is zero.

Fourteen of the fifteen recurring-loop closures in this window did not record a live save-rule observation. Several explicitly substituted unit tests or treated the browser miss as a non-blocking caveat. Only [GAM-248](/GAM/issues/GAM-248) recorded an exact live save-at-50. Unit tests prove engine arithmetic, but they cannot prove that the deployed save overlay, cumulative-score transition, and browser state flow work.

**Fix sketch:** make the browser scenario deterministic by using a seed, fixture, or state injection that forces both 50→25 and 100→50; assert the displayed explanation and resulting cumulative score; fail the command when the path is absent. If differential coverage is the intended operating model, change the recurring issue contract explicitly and define the maximum acceptable interval between deterministic browser checks.

Tracking: [GAM-252](/GAM/issues/GAM-252).

## Changes that matched intent

### Assaf scoring — GAM-229

Commit `a9ae535` changes the caller penalty to `callerTotal + 30` at `lib/games/yaniv.ts:312`, makes the round headline use the recorded delta at `app/play/yaniv/page.tsx:1916-1921`, and asserts a 7-point caller receives a 37-point delta at `lib/__tests__/yaniv.test.ts:271-275`. Later live runs observed `+36`, `+41`, `+42`, and `+44` Assaf outcomes, consistent with hand total plus 30.

### Deploy verifiability — GAM-230/GAM-231

Commits `16045a0`, `4400aa4`, and `4dea184` add the force-dynamic `/api/version` endpoint, response revision header, append-only deploy log, guarded post-merge promotion, exit logging, and deploy-gate tests. The implementation and runbook are honest that the hook only runs after merge/pull (`.githooks/post-merge:15-17`; `docs/deployments/yaniv.md:82-93`).

The live checkout also receives locally authored commits, so the hook does not make deployment fully automatic. That exact residual gap reproduced when GAM-234 remained unpromoted and again when GAM-239 found GAM-238 absent from live. It is already tracked by [GAM-235](/GAM/issues/GAM-235), which is in review pending founder confirmation for unattended live-box automation. No duplicate audit finding was filed.

The audit push reproduced the mechanism without changing product behavior: the pre-push dry-run built commit `fdb2012` successfully, but did not promote it, leaving live on the reviewed product revision `38219aa`. The Auditor did not run a production promotion for a documentation-only commit.

### 375px action button — GAM-234/GAM-236

Commit `b4bdb35` adds `min-w-0` to both flex wrappers and allows the longer action label to wrap at `app/play/yaniv/page.tsx:878-900`. GAM-236 then verified the fixed button in the live mobile viewport. The implementation choice matches the issue’s requirement without shortening the user-facing label.

### Stale hand-card selectors — GAM-237/GAM-238/GAM-239

Commit `38219aa` updates `yaniv-gear-qa.mjs` and `yaniv-ui-capture.mjs` to match the accessible hand-card label. GAM-239 first detected that live was stale, promoted the commit, then ran both committed drivers: the gear suite passed 6/6 and the capture driver selected real cards. The code-level intent was satisfied; the stale-live event is part of the already-tracked deployment carry-over above.

## Existing carry-over and watch items

- [GAM-235](/GAM/issues/GAM-235) remains in review with a pending founder confirmation. Until resolved, local commits still require a manual promotion when `/api/version` lags `HEAD`.
- [GAM-244](/GAM/issues/GAM-244) remains unassigned `todo`. Eight consecutive cycle reports encountered its stale home-picker anchor assertion and manually verified the current button → modal → “Play vs Bot” flow. This is already a correctly scoped test-infrastructure issue, so the audit did not duplicate it.
- The recurring cycle is producing strong exploratory evidence, but repeated random play is not a substitute for deterministic pass/fail gates on required rule transitions. GAM-252 addresses that distinction.

## Fresh verification

Run from the managed Yaniv checkout while the reviewed product `HEAD` was `38219aa`:

- `pnpm exec vitest run lib/__tests__/yaniv.test.ts` — 1 file, 31 tests passed.
- `pnpm test:deploy:yaniv` — exit 0.
- `node scripts/qa/yaniv-version-check.mjs $LIVE_BASE_URL --expect 38219aa` — live revision and `X-Yaniv-Revision` match `HEAD`.
- `node --check` on `yaniv-live-qa.mjs`, `yaniv-assaf-probe.mjs`, `yaniv-quick.mjs`, `yaniv-gear-qa.mjs`, and `yaniv-ui-capture.mjs` — all exit 0.

No product code was changed by this audit.
