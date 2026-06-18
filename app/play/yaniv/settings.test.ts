import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Yaniv settings", () => {
  it("offers Yaniv call thresholds from 3 through 15", () => {
    const source = readFileSync(join(process.cwd(), "app/play/yaniv/page.tsx"), "utf8");

    expect(source).toContain("Array.from({ length: 13 }, (_, i) => i + 3)");
  });
});
