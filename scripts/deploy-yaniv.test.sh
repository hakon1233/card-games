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

cache_dir="$(mktemp -d)"
fake_pnpm="$cache_dir/fake-pnpm"
trap 'rm -f "$output_file"; rm -rf "$cache_dir"' EXIT
cat >"$fake_pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in
  install)
    mkdir -p node_modules
    if [[ -f node_modules/.yaniv-cache-marker ]]; then
      echo "install reused cache in $PWD" >>"$YANIV_FAKE_PNPM_LOG"
    else
      echo "install created cache in $PWD" >>"$YANIV_FAKE_PNPM_LOG"
      echo marker >node_modules/.yaniv-cache-marker
    fi
    ;;
  build)
    mkdir -p .next/cache .next/server .next/static
    echo fake-build >.next/BUILD_ID
    echo '{}' >.next/build-manifest.json
    echo cache >.next/cache/.yaniv-build-cache-marker
    echo "build in $PWD" >>"$YANIV_FAKE_PNPM_LOG"
    ;;
  *)
    echo "unexpected fake pnpm command: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "$fake_pnpm"

YANIV_FAKE_PNPM_LOG="$cache_dir/pnpm.log" \
YANIV_DEPLOY_CACHE_DIR="$cache_dir/deploy-cache" \
YANIV_ALLOW_DIRTY_FOR_TESTS=true \
YANIV_PNPM_BIN="$fake_pnpm" \
  "$repo_root/scripts/deploy-yaniv.sh" --dry-run >"$output_file" 2>&1

YANIV_FAKE_PNPM_LOG="$cache_dir/pnpm.log" \
YANIV_DEPLOY_CACHE_DIR="$cache_dir/deploy-cache" \
YANIV_ALLOW_DIRTY_FOR_TESTS=true \
YANIV_PNPM_BIN="$fake_pnpm" \
  "$repo_root/scripts/deploy-yaniv.sh" --dry-run >"$output_file" 2>&1

grep -Fq 'install reused cache' "$cache_dir/pnpm.log" || {
  cat "$cache_dir/pnpm.log" >&2
  echo "dry-run must reuse the cached staging worktree dependencies" >&2
  exit 1
}

[[ -f "$cache_dir/deploy-cache/source/node_modules/.yaniv-cache-marker" ]] || {
  echo "dry-run must leave cached staging dependencies available for the next gate run" >&2
  exit 1
}

[[ -f "$cache_dir/deploy-cache/source/.next/cache/.yaniv-build-cache-marker" ]] || {
  echo "dry-run must leave the staged Next build cache available for the next gate run" >&2
  exit 1
}
