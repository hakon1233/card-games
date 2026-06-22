#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
build_id_file="$repo_root/.next/BUILD_ID"

if [[ ! -f "$build_id_file" ]]; then
  echo "expected an existing production build at $build_id_file" >&2
  exit 1
fi

before="$(shasum -a 256 "$build_id_file")"
output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

if YANIV_ALLOW_DIRTY_FOR_TESTS=true YANIV_PNPM_BIN=/usr/bin/false "$repo_root/scripts/deploy-yaniv.sh" --dry-run >"$output_file" 2>&1; then
  echo "deploy unexpectedly succeeded with a forced build failure" >&2
  exit 1
fi

after="$(shasum -a 256 "$build_id_file")"
[[ "$before" == "$after" ]] || {
  echo "a failed staged build changed the live BUILD_ID" >&2
  exit 1
}

grep -Fq 'build failed; the live build was not changed' "$output_file" || {
  cat "$output_file" >&2
  echo "deploy did not explicitly preserve the live build on failure" >&2
  exit 1
}

hook_file="$repo_root/.githooks/pre-push"
grep -Fxq 'pnpm deploy:yaniv:dry-run' "$hook_file" || {
  echo "pre-push must use the isolated deploy dry run" >&2
  exit 1
}

if grep -Fxq 'pnpm build' "$hook_file"; then
  echo "pre-push must not build in the live checkout" >&2
  exit 1
fi

if grep -Fq 'node_modules/.bin/pnpm' "$repo_root/scripts/deploy-yaniv.sh"; then
  echo "deploy must resolve pnpm from PATH, not a project-local executable" >&2
  exit 1
fi
