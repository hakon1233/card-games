#!/usr/bin/env sh

set -eu

# Point git at the versioned hook path. This wires up every hook under
# .githooks/, which currently is:
#   - pre-push:    runs `pnpm deploy:yaniv:dry-run` (build+validate the pushed
#                  revision in an isolated worktree; does NOT promote).
#   - post-merge:  auto-promotes a freshly-pulled revision via `pnpm deploy:yaniv`
#                  — but ONLY on the live host (guarded by branch=main + the
#                  launchd service being present, or YANIV_IS_LIVE_HOST=true).
#                  Opt out anywhere with YANIV_SKIP_POST_MERGE_DEPLOY=true.
# Runs automatically via the package.json "prepare" script on `pnpm install`.
git config core.hooksPath .githooks
