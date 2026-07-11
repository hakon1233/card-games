#!/usr/bin/env node

// Assert Yaniv deploy freshness in a single request (GAM-231). GETs
// /api/version and prints the deployed revision + build time so a QA cycle can
// tell "is live == main?" without spelunking .next/BUILD_ID or the deploy
// worktree. With --expect <sha>, exits non-zero unless the live revision
// matches, so it can gate a QA pass.
//
// Usage:
//   node scripts/qa/yaniv-version-check.mjs [baseUrl] [--expect <sha>]
// Env:
//   YANIV_VERSION_URL   base URL (default http://127.0.0.1:7842)
//
// Exit codes: 0 ok, 1 revision mismatch, 2 request/HTTP failure.

function parseArgs(argv) {
  let base = process.env.YANIV_VERSION_URL ?? "http://127.0.0.1:7842";
  let expect = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--expect") {
      expect = argv[++i] ?? null;
    } else if (arg.startsWith("--expect=")) {
      expect = arg.slice("--expect=".length);
    } else if (!arg.startsWith("--")) {
      base = arg;
    }
  }
  return { base, expect };
}

const { base, expect } = parseArgs(process.argv.slice(2));
const url = new URL("/api/version", base);

let res;
try {
  res = await fetch(url, { headers: { "cache-control": "no-store" } });
} catch (error) {
  console.error(`yaniv-version-check: request to ${url} failed: ${error.message}`);
  process.exit(2);
}

if (!res.ok) {
  console.error(`yaniv-version-check: ${url} returned HTTP ${res.status}`);
  process.exit(2);
}

const body = await res.json();
const header = res.headers.get("x-yaniv-revision") ?? "(none)";

console.log(`service:  ${body.service ?? "(unknown)"}`);
console.log(`revision: ${body.revision ?? "(unknown)"}`);
console.log(`short:    ${body.revisionShort ?? "(unknown)"}`);
console.log(`builtAt:  ${body.builtAt ?? "(unknown)"}`);
console.log(`X-Yaniv-Revision: ${header}`);

if (expect) {
  const want = expect.slice(0, 7);
  const got = String(body.revisionShort ?? "");
  const full = String(body.revision ?? "");
  if (got !== want && !full.startsWith(expect)) {
    console.error(
      `yaniv-version-check: live revision ${got || "(unknown)"} does not match expected ${want}`,
    );
    process.exit(1);
  }
  console.log(`OK: live revision matches ${want}`);
}
