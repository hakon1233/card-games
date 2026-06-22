import { describe, expect, it } from "vitest";

import {
  CARD_DECK_STORAGE_KEY,
  cardDeckLabel,
  coerceCardDeck,
  getInitialCardDeck,
} from "./card-deck-preferences";

describe("card deck preferences", () => {
  it("accepts only supported stored deck values", () => {
    expect(coerceCardDeck("two-color")).toBe("two-color");
    expect(coerceCardDeck("four-color")).toBe("four-color");
    expect(coerceCardDeck("rainbow")).toBeNull();
    expect(coerceCardDeck(null)).toBeNull();
    expect(coerceCardDeck(4)).toBeNull();
  });

  it("uses a valid stored value when present", () => {
    const storage = new Map<string, string>([[CARD_DECK_STORAGE_KEY, "four-color"]]);

    expect(
      getInitialCardDeck({ getStoredValue: (key) => storage.get(key) ?? null }),
    ).toBe("four-color");
  });

  it("defaults to the classic two-color deck when nothing is stored", () => {
    expect(getInitialCardDeck({ getStoredValue: () => null })).toBe("two-color");
  });

  it("ignores a corrupt stored value and falls back to two-color", () => {
    const storage = new Map<string, string>([[CARD_DECK_STORAGE_KEY, "neon"]]);

    expect(
      getInitialCardDeck({ getStoredValue: (key) => storage.get(key) ?? null }),
    ).toBe("two-color");
  });

  it("exposes human-readable labels", () => {
    expect(cardDeckLabel("two-color")).toBe("Two-color");
    expect(cardDeckLabel("four-color")).toBe("Four-color");
  });
});
