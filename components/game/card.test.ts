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
