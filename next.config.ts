import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Build-time git stamp for the /api/version freshness endpoint and the
// X-Yaniv-Revision header (GAM-231). The deploy builds inside a Git worktree
// checked out at the deployed revision, so `git rev-parse HEAD` yields the exact
// commit that gets promoted. Everything is wrapped so a missing/failed git (or a
// build outside a repo) never breaks the build — it just reports "unknown".
function resolveGitRev(): string {
  if (process.env.YANIV_GIT_REV) return process.env.YANIV_GIT_REV;
  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

const gitRev = resolveGitRev();
const buildTime = process.env.YANIV_BUILD_TIME || new Date().toISOString();
const revisionShort =
  gitRev && gitRev !== "unknown" ? gitRev.slice(0, 7) : "unknown";

const nextConfig: NextConfig = {
  // Inlined into the server bundle so /api/version can read the deployed commit.
  env: {
    YANIV_GIT_REV: gitRev,
    YANIV_BUILD_TIME: buildTime,
  },
  async headers() {
    return [
      {
        // Surface the live revision on every page/asset response so *any*
        // request reveals what's deployed — a cheap QA canary. /api/version is
        // excluded here because its route handler sets the header itself.
        source: "/((?!api/).*)",
        headers: [{ key: "X-Yaniv-Revision", value: revisionShort }],
      },
    ];
  },
};

export default nextConfig;
