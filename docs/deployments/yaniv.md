# Yaniv deploy runbook

The live app is a launchd service, `com.courtandtin.yaniv`, running `next start`
on port 3001. Tailscale serves port 7842 to that local port. Its plist is
`~/Library/LaunchAgents/com.courtandtin.yaniv.plist`; logs are
`/tmp/courtandtin-yaniv.{out,err}.log`.

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
changing the running service. For a manual service restart, use:

```sh
launchctl kickstart -k "gui/$(id -u)/com.courtandtin.yaniv"
```

The versioned pre-push hook runs `pnpm deploy:yaniv:dry-run`, including Next's
CSS resolution and production type checks in an isolated worktree. It must never
run `next build` in the live checkout. `pnpm install` installs that hook path
automatically.

Do not use shared integration branches. Every change lands on `main`; deploy
only from that committed revision through the atomic deploy command above.
