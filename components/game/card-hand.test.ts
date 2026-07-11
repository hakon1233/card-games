/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { CARD_DIMENSIONS } from "./card";
import { calculateHandLayout, CardHand } from "./card-hand";

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

  it("defaults to the standard fan when no form factor is given (GAM-50 baseline)", () => {
    const explicit = calculateHandLayout({
      count: 7,
      handWidth: 720,
      cardDimensions: CARD_DIMENSIONS.md,
      formFactor: "standard",
    });
    const implicit = calculateHandLayout({
      count: 7,
      handWidth: 720,
      cardDimensions: CARD_DIMENSIONS.md,
    });

    expect(explicit).toEqual(implicit);
  });

  it("widens the arc on widescreen — cards reposition (bigger stride + opened fan), not rescale", () => {
    const layout = calculateHandLayout({
      count: 7,
      handWidth: 720,
      cardDimensions: CARD_DIMENSIONS.md,
      formFactor: "widescreen",
    });

    // Cards spread farther apart (stride grows from the natural 64px to 80px).
    expect(layout.stride).toBe(CARD_DIMENSIONS.md.width + 24);
    expect(layout.overlapMargin).toBe(24);
    // The fan opens up symmetrically and the arc deepens.
    expect(layout.cards.map((card) => card.rotation)).toEqual([-14, -9, -5, 0, 5, 9, 14]);
    expect(layout.cards.map((card) => card.translateY)).toEqual([11, 5, 1, 0, 1, 5, 11]);
  });

  it("keeps a compact, thumb-reachable arc in the portrait bottom zone", () => {
    const layout = calculateHandLayout({
      count: 7,
      handWidth: 720,
      cardDimensions: CARD_DIMENSIONS.md,
      formFactor: "portrait",
    });

    // Portrait keeps the tight natural gap so the hand stays narrow.
    expect(layout.stride).toBe(CARD_DIMENSIONS.md.width + 8);
    // The fan is gentler than the standard baseline (±6° vs ±9°).
    expect(layout.cards.map((card) => card.rotation)).toEqual([-6, -4, -2, 0, 2, 4, 6]);
    expect(layout.cards.map((card) => card.translateY)).toEqual([6, 3, 1, 0, 1, 3, 6]);
  });

  it("orders the fan spread widescreen > standard > portrait at the edges", () => {
    const base = { count: 9, handWidth: 1000, cardDimensions: CARD_DIMENSIONS.md } as const;
    const edge = (formFactor: "portrait" | "standard" | "widescreen") => {
      const cards = calculateHandLayout({ ...base, formFactor }).cards;
      return cards[cards.length - 1].rotation;
    };

    expect(edge("widescreen")).toBeGreaterThan(edge("standard"));
    expect(edge("standard")).toBeGreaterThan(edge("portrait"));
  });
});

describe("CardHand accessibility", () => {
  it("names each clickable card button by card and hand position", () => {
    render(
      createElement(CardHand, {
        cards: [
          { suit: "hearts", rank: "A", faceUp: true },
          { suit: "spades", rank: "10", faceUp: true },
        ],
        gameType: "yaniv",
        onCardClick: vi.fn(),
        showSortPicker: false,
      }),
    );

    expect(screen.getByRole("button", { name: "Select A of hearts, card 1 of 2" })).toBeInstanceOf(
      HTMLButtonElement,
    );
    expect(screen.getByRole("button", { name: "Select 10 of spades, card 2 of 2" })).toBeInstanceOf(
      HTMLButtonElement,
    );
  });

  it("allows the sort label to wrap instead of truncating in narrow hands", () => {
    render(
      createElement(CardHand, {
        cards: [
          { suit: "hearts", rank: "A", faceUp: true },
          { suit: "spades", rank: "10", faceUp: true },
        ],
        gameType: "blackjack",
      }),
    );

    const sortLabel = screen.getByText("Manual order").parentElement;
    expect(sortLabel?.classList.contains("truncate")).toBe(false);
    expect(sortLabel?.classList.contains("break-words")).toBe(true);
  });
});
