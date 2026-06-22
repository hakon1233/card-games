#!/usr/bin/env bash

# Build outside the directory served by launchd. Only a complete build is ever
# promoted into .next, and every promotion is smoke-tested with rollback.
set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
pnpm_bin="${YANIV_PNPM_BIN:-$(command -v pnpm || true)}"
service_label="${YANIV_SERVICE_LABEL:-com.courtandtin.yaniv}"
service_target="${YANIV_SERVICE_TARGET:-gui/$(id -u)/$service_label}"
smoke_url="${YANIV_SMOKE_URL:-http://127.0.0.1:3001/}"
revision="${YANIV_DEPLOY_REF:-HEAD}"
dry_run=false
staging_root=""
backup_next=""
promoted=false

usage() {
  cat <<'EOF'
Usage: scripts/deploy-yaniv.sh [--dry-run]

Builds the checked-out revision in an isolated Git worktree. On a successful
build, it atomically replaces .next, restarts com.courtandtin.yaniv, and
verifies the SSR page plus every referenced static chunk. A failed build or
smoke test leaves (or restores) the prior .next build.
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    --help|-h) usage; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

cleanup() {
  [[ -z "$staging_root" ]] || rm -rf "$staging_root"
}

restore_previous_build() {
  if [[ "$promoted" != true || -z "$backup_next" || ! -d "$backup_next" ]]; then
    return
  fi

  echo "rolling back to the previous build" >&2
  [[ ! -d "$app_dir/.next" ]] || mv "$app_dir/.next" "$staging_root/failed-next"
  mv "$backup_next" "$app_dir/.next"
  promoted=false
  launchctl kickstart -k "$service_target"
}

on_interrupt() {
  restore_previous_build
  exit 1
}

trap cleanup EXIT
trap on_interrupt HUP INT TERM

cd "$app_dir"
[[ -x "$pnpm_bin" ]] || { echo "pnpm not executable: $pnpm_bin" >&2; exit 1; }
if [[ "${YANIV_ALLOW_DIRTY_FOR_TESTS:-false}" != true ]]; then
  git diff --quiet && git diff --cached --quiet || {
    echo "refusing to deploy a dirty checkout; commit or discard local changes first" >&2
    exit 1
  }
fi
revision="$(git rev-parse --verify "$revision^{commit}")"

staging_root="$(mktemp -d "${TMPDIR:-/tmp}/yaniv-deploy.XXXXXX")"
staging_dir="$staging_root/source"
git worktree add --detach "$staging_dir" "$revision" >/dev/null

echo "building $revision in $staging_dir"
if ! (
  cd "$staging_dir"
  "$pnpm_bin" install --frozen-lockfile
  "$pnpm_bin" build
); then
  echo "build failed; the live build was not changed" >&2
  exit 1
fi

for required in BUILD_ID build-manifest.json server static; do
  [[ -e "$staging_dir/.next/$required" ]] || {
    echo "staged build is incomplete: missing .next/$required" >&2
    echo "build failed; the live build was not changed" >&2
    exit 1
  }
done

if [[ "$dry_run" == true ]]; then
  echo "staged build is valid; dry run finished before promotion"
  exit 0
fi

[[ -d "$app_dir/.next" && -f "$app_dir/.next/BUILD_ID" ]] || {
  echo "refusing to replace a missing or incomplete live build" >&2
  exit 1
}

backup_next="$staging_root/previous-next"
mv "$app_dir/.next" "$backup_next"
mv "$staging_dir/.next" "$app_dir/.next"
promoted=true

smoke_test() {
  local html asset asset_count=0 attempt=0
  until html="$(curl --fail --silent --show-error "$smoke_url")"; do
    attempt=$((attempt + 1))
    [[ "$attempt" -lt 15 ]] || return 1
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
  echo "post-restart smoke test failed" >&2
  restore_previous_build
  exit 1
fi

promoted=false
rm -rf "$backup_next"
echo "deploy succeeded: $revision"
