// Deploy freshness endpoint. Answers "what revision is live right now?" in one
// request so a QA cycle no longer has to spelunk `.next/BUILD_ID` and the deploy
// worktree to detect a stale build (GAM-230/GAM-231).
//
// The revision/build time are stamped at build time via next.config.ts `env`
// (populated from `git rev-parse HEAD` inside the deployed worktree). Marked
// force-dynamic + no-store so it can never serve a statically-cached stale value.
export const dynamic = "force-dynamic";

const revision = process.env.YANIV_GIT_REV || "unknown";
const revisionShort =
  revision && revision !== "unknown" ? revision.slice(0, 7) : "unknown";
const builtAt = process.env.YANIV_BUILD_TIME || "unknown";

export async function GET() {
  return Response.json(
    { revision, revisionShort, builtAt, service: "yaniv" },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Yaniv-Revision": revisionShort,
      },
    },
  );
}
