import { describe, expect, it } from "vitest";

import type { ShellCard } from "./shell-types";
import {
  GAME_DEFAULT_SORT,
  SORT_LABELS,
  orderCardKeysForHand,
  sortCards,
  sortCardsWithOriginalIndices,
  type SortStrategy,
} from "./card-sorting";

const card = (rank: ShellCard["rank"], suit: ShellCard["suit"]): ShellCard => ({
  rank,
  suit,
  faceUp: true,
});

const labels = (cards: ShellCard[]) => cards.map((c) => `${c.rank}-${c.suit}`);

describe("card sorting", () => {
  it("defines all UI labels and per-game defaults", () => {
    const strategies: SortStrategy[] = [
      "none",
      "rank-asc",
      "rank-desc",
      "suit-then-rank",
      "rank-then-suit",
      "color-then-rank",
      "value-asc",
      "value-desc",
    ];

    expect(Object.keys(SORT_LABELS).sort()).toEqual([...strategies].sort());
    expect(GAME_DEFAULT_SORT).toMatchObject({
      blackjack: "none",
      go_fish: "none",
      crazy_eights: "none",
      yaniv: "none",
    });
  });

  it("sorts rank groups by rank and then suit for Go Fish", () => {
    const cards = [
      card("K", "hearts"),
      card("2", "clubs"),
      card("2", "spades"),
      card("A", "diamonds"),
      card("2", "hearts"),
    ];

    expect(labels(sortCards(cards, "rank-then-suit", "go_fish"))).toEqual([
      "A-diamonds",
      "2-spades",
      "2-hearts",
      "2-clubs",
      "K-hearts",
    ]);
  });

  it("sorts Crazy Eights by suit and places all eights last", () => {
    const cards = [
      card("8", "spades"),
      card("A", "clubs"),
      card("K", "spades"),
      card("3", "hearts"),
      card("8", "diamonds"),
      card("2", "spades"),
    ];

    expect(labels(sortCards(cards, "suit-then-rank", "crazy_eights"))).toEqual([
      "2-spades",
      "K-spades",
      "3-hearts",
      "A-clubs",
      "8-spades",
      "8-diamonds",
    ]);
  });

  it("uses game-specific values for ascending and descending value sorts", () => {
    const cards = [
      card("K", "clubs"),
      card("A", "spades"),
      card("10", "diamonds"),
      card("5", "hearts"),
    ];

    expect(labels(sortCards(cards, "value-asc", "yaniv"))).toEqual([
      "A-spades",
      "5-hearts",
      "10-diamonds",
      "K-clubs",
    ]);
    expect(labels(sortCards(cards, "value-desc", "blackjack"))).toEqual([
      "A-spades",
      "K-clubs",
      "10-diamonds",
      "5-hearts",
    ]);
  });

  it("keeps dealt order for none and never mutates the input", () => {
    const cards = [card("K", "clubs"), card("A", "spades"), card("5", "hearts")];
    const original = [...cards];

    expect(sortCards(cards, "none", "blackjack")).toEqual(cards);
    expect(sortCards(cards, "rank-asc", "blackjack")).not.toBe(cards);
    expect(cards).toEqual(original);
  });

  it("returns original indices after sorting so click handlers stay index-stable", () => {
    const cards = [card("K", "clubs"), card("A", "spades"), card("5", "hearts")];

    expect(sortCardsWithOriginalIndices(cards, "rank-asc", "blackjack")).toEqual([
      { card: cards[1], originalIndex: 1 },
      { card: cards[2], originalIndex: 2 },
      { card: cards[0], originalIndex: 0 },
    ]);
  });

  it("preserves manual hand order across removed cards and appends newly drawn cards", () => {
    const cards = [card("K", "clubs"), card("A", "spades"), card("5", "hearts")];
    const key = (c: ShellCard) => `${c.rank}-${c.suit}`;
    const manualOrder = ["5-hearts", "K-clubs", "A-spades"];

    expect(orderCardKeysForHand(cards, manualOrder, key)).toEqual([
      "5-hearts",
      "K-clubs",
      "A-spades",
    ]);

    expect(
      orderCardKeysForHand(
        [card("A", "spades"), card("5", "hearts"), card("Q", "diamonds")],
        manualOrder,
        key,
      ),
    ).toEqual(["5-hearts", "A-spades", "Q-diamonds"]);
  });
});
