import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createElement } from "react";

import { bottomCornerRankText, PlayingCard } from "./card";

describe("bottomCornerRankText", () => {
  it("pre-reverses two-character ranks so rotation preserves visual order", () => {
    expect(bottomCornerRankText("10")).toBe("01");
  });

  it("leaves single-character ranks unchanged", () => {
    expect(bottomCornerRankText("J")).toBe("J");
  });
});

describe("PlayingCard sizing", () => {
  const card = { suit: "hearts" as const, rank: "10" as const, faceUp: true };

  it("renders a small face-up card with the sm geometry", () => {
    const html = renderToStaticMarkup(createElement(PlayingCard, { card, size: "sm" }));
    expect(html).toContain("w-10 h-14");
    expect(html).toContain("10 of hearts");
  });

  it("renders a large, legible top-discard card with bigger geometry and type", () => {
    const html = renderToStaticMarkup(createElement(PlayingCard, { card, size: "lg" }));
    // Larger box and oversized suit symbol so the key decision input reads at a glance.
    expect(html).toContain("w-20 h-28");
    expect(html).toContain("text-4xl");
  });
});

describe("PlayingCard suit accessibility (GAM-55)", () => {
  it("tags each suit with a CSS class so the four-color deck can recolor it", () => {
    for (const [suit, cls] of [
      ["hearts", "pip-suit-hearts"],
      ["diamonds", "pip-suit-diamonds"],
      ["clubs", "pip-suit-clubs"],
      ["spades", "pip-suit-spades"],
    ] as const) {
      const html = renderToStaticMarkup(
        createElement(PlayingCard, { card: { suit, rank: "7" as const, faceUp: true } }),
      );
      expect(html).toContain(cls);
      // Color is never the only channel: the suit glyph is always rendered.
      expect(html).toContain(SUIT_SYMBOL[suit]);
    }
  });

  it("does not hardcode a raw red/black Tailwind color on the card", () => {
    const html = renderToStaticMarkup(
      createElement(PlayingCard, { card: { suit: "hearts" as const, rank: "7" as const, faceUp: true } }),
    );
    // Suit color must come from the toggleable CSS channel, not a fixed utility.
    expect(html).not.toContain("text-red-600");
    expect(html).not.toContain("text-gray-900");
  });
});

const SUIT_SYMBOL = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" } as const;
