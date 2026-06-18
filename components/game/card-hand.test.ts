import { describe, expect, it } from "vitest";

import { CARD_DIMENSIONS } from "./card";
import { calculateHandLayout } from "./card-hand";

describe("calculateHandLayout", () => {
  it("keeps roomy hands fully spaced while fanning around the center", () => {
    const layout = calculateHandLayout({
      count: 7,
      handWidth: 720,
      cardDimensions: CARD_DIMENSIONS.md,
    });

    expect(layout.stride).toBe(CARD_DIMENSIONS.md.width + 8);
    expect(layout.cards.map((card) => card.rotation)).toEqual([-9, -6, -3, 0, 3, 6, 9]);
    expect(layout.cards.map((card) => card.translateY)).toEqual([8, 4, 1, 0, 1, 4, 8]);
    expect(layout.needsScroll).toBe(false);
  });

  it("progressively overlaps medium hands without covering the corner index", () => {
    const layout = calculateHandLayout({
      count: 12,
      handWidth: 360,
      cardDimensions: CARD_DIMENSIONS.md,
    });

    expect(layout.stride).toBe(27.636363636363637);
    expect(layout.overlapMargin).toBe(-28);
    expect(layout.stride).toBeGreaterThanOrEqual(CARD_DIMENSIONS.md.cornerWidth);
    expect(layout.needsScroll).toBe(false);
  });

  it("uses the compact floor for very large hands and scrolls only when necessary", () => {
    const layout = calculateHandLayout({
      count: 15,
      handWidth: 280,
      cardDimensions: CARD_DIMENSIONS.md,
    });

    expect(layout.stride).toBe(CARD_DIMENSIONS.md.cornerWidth);
    expect(layout.overlapMargin).toBe(CARD_DIMENSIONS.md.cornerWidth - CARD_DIMENSIONS.md.width);
    expect(layout.contentWidth).toBe(350);
    expect(layout.needsScroll).toBe(true);
  });
});
