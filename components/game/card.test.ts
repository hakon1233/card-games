import { describe, expect, it } from "vitest";

import { bottomCornerRankText } from "./card";

describe("bottomCornerRankText", () => {
  it("pre-reverses two-character ranks so rotation preserves visual order", () => {
    expect(bottomCornerRankText("10")).toBe("01");
  });

  it("leaves single-character ranks unchanged", () => {
    expect(bottomCornerRankText("J")).toBe("J");
  });
});
