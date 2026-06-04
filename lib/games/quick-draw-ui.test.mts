import { describe, expect, it } from "vitest";
import { formatQuickDrawTime } from "./quick-draw-ui";

describe("formatQuickDrawTime", () => {
  it("formats remaining quick-draw time in tenths of a second", () => {
    expect(formatQuickDrawTime(2000)).toBe("2.0s");
    expect(formatQuickDrawTime(1750)).toBe("1.8s");
    expect(formatQuickDrawTime(550)).toBe("0.6s");
  });

  it("clamps expired quick-draw time to zero", () => {
    expect(formatQuickDrawTime(0)).toBe("0.0s");
    expect(formatQuickDrawTime(-250)).toBe("0.0s");
  });
});
