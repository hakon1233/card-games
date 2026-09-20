#!/usr/bin/env bash

set -euo pipefail

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
domain="${YANIV_EDGE_DOMAIN:-127.0.0.1}"
state_dir="${YANIV_EDGE_STATE_DIR:-$HOME/Library/Application Support/Yaniv/edge}"
cert_file="${YANIV_EDGE_CERT_FILE:-$state_dir/$domain.crt}"
key_file="${YANIV_EDGE_KEY_FILE:-$state_dir/$domain.key}"
node_bin="${YANIV_EDGE_NODE_BIN:-$(command -v node || true)}"

mkdir -p "$state_dir"
[[ -x "$node_bin" ]] || { echo "node not executable: $node_bin" >&2; exit 1; }

if [[ ! -s "$cert_file" || ! -s "$key_file" ]]; then
  tailscale cert --cert-file "$cert_file" --key-file "$key_file" "$domain"
fi

export YANIV_EDGE_CERT_FILE="$cert_file"
export YANIV_EDGE_KEY_FILE="$key_file"
exec "$node_bin" "$app_dir/scripts/yaniv-edge-server.mjs"
