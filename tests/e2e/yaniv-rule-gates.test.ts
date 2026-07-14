import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("Yaniv live QA rule-path gates", () => {
  it("has a deterministic browser gate for both save-rule transitions", () => {
    const script = read("tests/e2e/yaniv-rule-gates.mjs");

    expect(script).toContain("save-50");
    expect(script).toContain("save-100");
    expect(script).toContain("savedScores");
    expect(script).toContain("process.exit(failed.length ? 1 : 0)");
  });

  it("exposes only explicit QA fixtures for forced live-rule paths", () => {
    const route = read("app/api/yaniv/qa/route.ts");

    expect(route).toContain("process.env.YANIV_ENABLE_QA_FIXTURES");
    expect(route).toContain('"Yaniv QA fixtures are disabled"');
    expect(route).toContain("save-50");
    expect(route).toContain("save-100");
    expect(route).toContain("setYanivGame");
  });

  it("keeps note-only Yaniv probes from passing when required rule paths are skipped", () => {
    const assafProbe = read("tests/e2e/yaniv-assaf-probe.mjs");
    const quickProbe = read("tests/e2e/yaniv-quick.mjs");

    expect(assafProbe).toContain("process.exit(failed.length ? 1 : 0)");
    expect(quickProbe).toContain("process.exit(failed.length ? 1 : 0)");
    expect(quickProbe).not.toContain("saveObserved = false");
  });
});
