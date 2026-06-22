import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Yaniv turn-clock race protection", () => {
  it("invalidates an old countdown callback before the next turn starts", () => {
    expect(pageSource).toContain("turnClockGenerationRef");
    expect(pageSource).toContain("turnClockGenerationRef.current += 1");
    expect(pageSource).toContain("turnClockGeneration !== turnClockGenerationRef.current");
  });
});
