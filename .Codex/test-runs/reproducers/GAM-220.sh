#!/usr/bin/env bash
set -euo pipefail

files=(
  "tests/e2e/yaniv-live-qa.mjs"
  "tests/e2e/yaniv-assaf-probe.mjs"
  "tests/e2e/yaniv-quick.mjs"
)

for file in "${files[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "missing expected file: $file" >&2
    exit 2
  fi

  if ! grep -Eq 'const cardRe = /\^Select \(\[A-Za-z0-9\]\+\) of \(hearts\|diamonds\|clubs\|spades\), card \\d\+ of \\d\+\$/i;' "$file"; then
    echo "$file still uses a card regex that can include non-hand controls" >&2
    exit 1
  fi
done
