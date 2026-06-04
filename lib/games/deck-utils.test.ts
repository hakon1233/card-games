import { describe, expect, it } from "vitest";
import { buildDeck, RANKS, shuffle, SUITS } from "./deck-utils";

describe("deck-utils", () => {
  it("exports the standard 52-card deck parts", () => {
    expect(SUITS).toEqual(["hearts", "diamonds", "clubs", "spades"]);
    expect(RANKS).toEqual(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);

    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((card) => `${card.rank}-${card.suit}`)).size).toBe(52);
  });

  it("shuffles without mutating the input deck", () => {
    const deck = buildDeck();
    const original = [...deck];

    expect(shuffle(deck)).toHaveLength(52);
    expect(deck).toEqual(original);
  });
});
