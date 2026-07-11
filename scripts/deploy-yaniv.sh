#!/usr/bin/env bash

# Build outside the directory served by launchd. Only a complete build is ever
# promoted into .next, and every promotion is smoke-tested with rollback.
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache_key="$(printf '%s' "$app_dir" | shasum -a 256 | awk '{print substr($1, 1, 16)}')"
pnpm_bin="${YANIV_PNPM_BIN:-$(command -v pnpm || true)}"
service_label="${YANIV_SERVICE_LABEL:-com.courtandtin.yaniv}"
service_target="${YANIV_SERVICE_TARGET:-gui/$(id -u)/$service_label}"
smoke_url="${YANIV_SMOKE_URL:-http://127.0.0.1:3001/}"
# Post-restart smoke retry budget. A cold `next start` of this app takes ~20s to
# accept connections, so the budget must comfortably exceed that or every deploy
# rolls back on a healthy build. ~60s of headroom by default; overridable.
smoke_max_attempts="${YANIV_SMOKE_MAX_ATTEMPTS:-60}"
revision="${YANIV_DEPLOY_REF:-HEAD}"
dry_run=false
mode="promote"
cache_root="${YANIV_DEPLOY_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/Library/Caches}/yaniv-deploy/$cache_key}"
# Durable, append-only deploy log. Answers "what's live, when it was promoted,
# and every attempt+outcome" from a file, independent of the app being up
# (GAM-231). Override for tests/CI via YANIV_DEPLOY_LOG.
deploy_log="${YANIV_DEPLOY_LOG:-$HOME/Library/Logs/yaniv-deploy.log}"
staging_root=""
staging_dir=""
lock_dir=""
backup_next=""
promoted=false

# Never let logging abort the deploy (keep the outer `set -euo pipefail`): an
# unwritable log or missing dir is tolerated. No secrets are ever logged.
log() {
  mkdir -p "$(dirname "$deploy_log")" 2>/dev/null || true
  printf '%s [yaniv-deploy] %s\n' "$(date -u +%FT%TZ)" "$*" >>"$deploy_log" 2>/dev/null || true
}

# Best-effort short SHA for logging; falls back to the raw ref if git can't
# resolve it (e.g. a still-symbolic HEAD before resolution).
short_rev() {
  git rev-parse --short "${1:-HEAD}" 2>/dev/null || printf '%.12s' "${1:-unknown}"
}

usage() {
  cat <<'EOF'
Usage: scripts/deploy-yaniv.sh [--dry-run]

Builds the checked-out revision in an isolated cached Git worktree. On a
successful build, it atomically replaces .next, restarts com.courtandtin.yaniv,
and verifies the SSR page plus every referenced static chunk. A failed build
or smoke test leaves (or restores) the prior .next build.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true; mode="dry-run" ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

cleanup() {
  local rc=$?
  [[ -z "$lock_dir" || ! -d "$lock_dir" ]] || rmdir "$lock_dir" 2>/dev/null || true
  # Backstop so no exit is ever silent (GAM-231, CTO review): the named paths
  # each log their own reason, but an unhandled `set -e` death (an unresolvable
  # ref, a `git worktree add` failure) or the lock-contention reject would
  # otherwise leave no trail. Record the final rc on every exit. Best-effort,
  # like log() itself, so it can never change the deploy's outcome.
  log "exit rc=${rc} rev=$(short_rev "$revision")"
}

prune_staged_build_outputs() {
  [[ -n "$staging_dir" && -d "$staging_dir/.next" ]] || return 0
  find "$staging_dir/.next" -mindepth 1 -maxdepth 1 ! -name cache -exec rm -rf {} + || true
}

# Available space (whole MiB) on the volume that holds "$1". Prints nothing and
# fails if it cannot be measured, so callers can choose not to block on it.
free_space_mb() {
  local kb
  kb="$(df -Pk "$1" 2>/dev/null | awk 'NR==2 {print $4}')" || return 1
  [[ "$kb" =~ ^[0-9]+$ ]] || return 1
  printf '%s' "$((kb / 1024))"
}

# Guard against a silent ENOSPC in `next build`. When the Data volume fills up,
# the build gate fails closed and blocks *every* deploy company-wide with a
# cryptic ENOSPC deep inside the build (GAM-114). Before the expensive build we
# reclaim reversible space (pnpm store + stale git worktree metadata, the two
# consumers that caused the original incident) and, if headroom is still below a
# hard floor, abort early with an actionable message instead of ENOSPC.
ensure_disk_headroom() {
  local trigger_mb="${YANIV_DEPLOY_MIN_FREE_MB:-5120}"
  local abort_mb="${YANIV_DEPLOY_ABORT_FREE_MB:-2048}"
  local free_mb
  free_mb="$(free_space_mb "$app_dir")" || return 0

  if [[ "$free_mb" -ge "$trigger_mb" ]]; then
    return 0
  fi

  echo "disk headroom low: ${free_mb} MiB free (want >= ${trigger_mb} MiB); reclaiming space" >&2
  git worktree prune >/dev/null 2>&1 || true
  "$pnpm_bin" store prune >/dev/null 2>&1 || true

  free_mb="$(free_space_mb "$app_dir")" || return 0
  echo "disk headroom after reclamation: ${free_mb} MiB free" >&2

  if [[ "$free_mb" -lt "$abort_mb" ]]; then
    log "abort reason=low-disk free_mb=${free_mb} need_mb=${abort_mb}"
    echo "aborting deploy: only ${free_mb} MiB free on the Data volume (need >= ${abort_mb} MiB to build safely)." >&2
    echo "the build gate fails on ENOSPC when the disk is full; free space before retrying (old builds/caches, paperclip logs/transcripts). See GAM-114." >&2
    exit 1
  fi
}

restore_previous_build() {
  if [[ "$promoted" != true || -z "$backup_next" || ! -d "$backup_next" ]]; then
    return
  fi

  log "rollback rev=$(short_rev "$revision")"
  echo "rolling back to the previous build" >&2
  rm -rf "$staging_root/failed-next"
  [[ ! -d "$app_dir/.next" ]] || mv "$app_dir/.next" "$staging_root/failed-next"
  mv "$backup_next" "$app_dir/.next"
  rm -rf "$staging_root/failed-next"
  promoted=false
  launchctl kickstart -k "$service_target"
}

prepare_staging_worktree() {
  mkdir -p "$staging_root"
  # Claim the mutex first; only record ownership (which cleanup removes) AFTER
  # winning it, so a losing concurrent deploy can't rmdir the winner's lock.
  if ! mkdir "$staging_root/.lock" 2>/dev/null; then
    log "abort reason=lock-contention"
    echo "another Yaniv deploy gate is already using $staging_root" >&2
    exit 1
  fi
  lock_dir="$staging_root/.lock"

  if [[ ! -d "$staging_dir/.git" && ! -f "$staging_dir/.git" ]]; then
    rm -rf "$staging_dir"
    git worktree prune >/dev/null 2>&1 || true
    git worktree add --detach "$staging_dir" "$revision" >/dev/null
  fi

  git -C "$staging_dir" reset --hard "$revision" >/dev/null
  git -C "$staging_dir" clean -ffd -e node_modules/ -e .next/cache/ >/dev/null
  prune_staged_build_outputs
}

on_interrupt() {
  log "interrupted rev=$(short_rev "$revision")"
  restore_previous_build
  exit 1
}

trap cleanup EXIT
trap on_interrupt HUP INT TERM

cd "$app_dir"
log "start mode=$mode ref=$revision rev=$(short_rev "$revision")"
[[ -x "$pnpm_bin" ]] || { log "abort reason=pnpm-not-executable bin=$pnpm_bin"; echo "pnpm not executable: $pnpm_bin" >&2; exit 1; }
if [[ "${YANIV_ALLOW_DIRTY_FOR_TESTS:-false}" != true ]]; then
  git diff --quiet && git diff --cached --quiet || {
    log "abort reason=dirty-checkout"
    echo "refusing to deploy a dirty checkout; commit or discard local changes first" >&2
    exit 1
  }
fi
revision="$(git rev-parse --verify "$revision^{commit}")"

staging_root="$cache_root"
staging_dir="$staging_root/source"
ensure_disk_headroom
prepare_staging_worktree

echo "building $revision in $staging_dir"
if ! (
  cd "$staging_dir"
  "$pnpm_bin" install --frozen-lockfile
  "$pnpm_bin" build
); then
  prune_staged_build_outputs
  log "build-failed rev=$(short_rev "$revision")"
  echo "build failed; the live build was not changed" >&2
  exit 1
fi

for required in BUILD_ID build-manifest.json server static; do
  [[ -e "$staging_dir/.next/$required" ]] || {
    prune_staged_build_outputs
    log "incomplete-build rev=$(short_rev "$revision") missing=.next/$required"
    echo "staged build is incomplete: missing .next/$required" >&2
    echo "build failed; the live build was not changed" >&2
    exit 1
  }
done

if [[ "$dry_run" == true ]]; then
  log "dry-run-ok rev=$(short_rev "$revision")"
  echo "staged build is valid; dry run finished before promotion"
  prune_staged_build_outputs
  exit 0
fi

[[ -d "$app_dir/.next" && -f "$app_dir/.next/BUILD_ID" ]] || {
  prune_staged_build_outputs
  log "abort reason=missing-live-build rev=$(short_rev "$revision")"
  echo "refusing to replace a missing or incomplete live build" >&2
  exit 1
}

backup_next="$staging_root/previous-next"
rm -rf "$backup_next"
mv "$app_dir/.next" "$backup_next"
mv "$staging_dir/.next" "$app_dir/.next"
promoted=true

smoke_test() {
  local html asset asset_count=0 attempt=0
  until html="$(curl --fail --silent --show-error "$smoke_url")"; do
    attempt=$((attempt + 1))
    [[ "$attempt" -lt "$smoke_max_attempts" ]] || return 1
    sleep 1
  done

  while IFS= read -r asset; do
    [[ -z "$asset" ]] && continue
    asset_count=$((asset_count + 1))
    curl --fail --silent --show-error -o /dev/null "${smoke_url%/}$asset" || return 1
  done < <(printf '%s' "$html" | grep -Eo '/_next/static/[^"'"'"'[:space:]?]+' | sort -u)

  [[ "$asset_count" -gt 0 ]]
}

launchctl kickstart -k "$service_target"
if ! smoke_test; then
  log "smoke-failed rev=$(short_rev "$revision")"
  echo "post-restart smoke test failed" >&2
  restore_previous_build
  exit 1
fi

promoted=false
rm -rf "$backup_next"
log "promote rev=$revision short=$(short_rev "$revision")"
echo "deploy succeeded: $revision"
