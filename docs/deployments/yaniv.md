# Yaniv deploy runbook

The live app is a launchd service, `com.courtandtin.yaniv`, running `next start`
on port 3001. Its plist is `~/Library/LaunchAgents/com.courtandtin.yaniv.plist`;
logs are `/tmp/courtandtin-yaniv.{out,err}.log`.

The tailnet-facing port is handled by a separate launchd service,
`com.courtandtin.yaniv-edge`, running `scripts/run-yaniv-edge.sh` on local port
3002. Tailscale forwards raw TCP port 7842 to that edge service. The edge
service redirects plain HTTP requests to `https://...:7842/...`, terminates TLS
with a `tailscale cert` certificate, and proxies HTTPS traffic to Next on 3001.

Do not run `next build` in the live checkout. The service can continue serving
HTML whose chunk references no longer exist while `.next` is being rebuilt.

Deploy the checked-out, committed revision with:

```sh
pnpm deploy:yaniv
```

The command builds an isolated Git worktree, checks the staged build for the
required Next files, promotes `.next` only after a successful build, restarts
launchd, then checks the SSR response and every referenced `/_next/static` file.
If the build or smoke test fails, it retains or restores the previous build.

Use `pnpm deploy:yaniv:dry-run` to prove the current revision builds without
changing the running service. **A dry-run is validation, not deployment** — it
builds and validates the staged `.next` in the isolated worktree, then discards
it and exits *without promoting*. Pushing therefore never makes new code live; a
push only proves the pushed revision builds. Making it live requires the real
`pnpm deploy:yaniv` (or the `post-merge` hook below). Skipping the real promote
is exactly the gap that left `:7842` serving a stale build (GAM-230/GAM-231).

For a manual service restart, use:

```sh
launchctl kickstart -k "gui/$(id -u)/com.courtandtin.yaniv"
launchctl kickstart -k "gui/$(id -u)/com.courtandtin.yaniv-edge"
```

The versioned pre-push hook runs `pnpm deploy:yaniv:dry-run`, including Next's
CSS resolution and production type checks in an isolated worktree. It must never
run `next build` in the live checkout. `pnpm install` installs that hook path
automatically.

## Verifying what's live

Every build is stamped with its git revision (`next.config.ts` reads
`git rev-parse HEAD` in the worktree it builds, so the stamp is the exact commit
that gets promoted). At runtime that revision is exposed two ways:

- **`GET /api/version`** → `{ revision, revisionShort, builtAt, service }` with
  `Cache-Control: no-store` and an `X-Yaniv-Revision` header.
- **`X-Yaniv-Revision`** header on every page/asset response.

So "is live == `main`?" is a one-request assertion — no `.next/BUILD_ID` or
deploy-worktree spelunking. The checker prints the live revision and can gate a
QA pass against an expected commit:

```sh
node scripts/qa/yaniv-version-check.mjs                          # print live revision
node scripts/qa/yaniv-version-check.mjs --expect "$(git rev-parse --short HEAD)"
```

It defaults to `http://127.0.0.1:7842`; override with a base-URL argument or
`YANIV_VERSION_URL`. Exit 0 = fresh, 1 = revision mismatch, 2 = unreachable.

## Deploy log

`deploy-yaniv.sh` appends to a durable log — `$YANIV_DEPLOY_LOG`, default
`~/Library/Logs/yaniv-deploy.log`. It records a `start` line and every
terminating outcome (`promote`, `dry-run-ok`, `build-failed`, `incomplete-build`,
`rollback`, `smoke-failed`, `interrupted`, and each `abort reason=…`), each
timestamped UTC. "What's live, when it was promoted, and every attempt+outcome"
is answerable from that file even when the app is down. No secrets are logged.

```sh
tail -f ~/Library/Logs/yaniv-deploy.log
```

## Auto-promote on pull (post-merge hook)

The versioned `post-merge` hook runs the real `pnpm deploy:yaniv` after a
`git pull`/`git merge`, so pulling `main` into the live app_dir auto-promotes.
It is **guarded** so agent workspaces that also pull don't each deploy: it only
runs on branch `main`, and only when this box is the live host — either
`YANIV_IS_LIVE_HOST=true`, or the `com.courtandtin.yaniv` launchd service is
actually loaded here. Set `YANIV_SKIP_POST_MERGE_DEPLOY=true` to opt out
anywhere. Safe because `deploy:yaniv` is atomic, smoke-tested, and auto-rolls
back. (A launchd/cron reconciler that polls `origin/main` vs live and pulls when
behind — full auto-deploy-on-merge for this no-CI box — is a separate,
ops-signed-off follow-up, not this hook.)

Do not use shared integration branches. Every change lands on `main`; deploy
only from that committed revision through the atomic deploy command above.

If the Tailscale serve config needs to be restored manually, keep 7842 as a raw
TCP forward to the edge service:

```sh
tailscale serve --tcp=7842 tcp://127.0.0.1:3002
```

The focused edge regression test is:

```sh
pnpm test:yaniv-edge
```
