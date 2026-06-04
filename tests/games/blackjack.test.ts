import { describe, it, expect } from "vitest";
import {
  buildDeck,
  shuffle,
  cardValue,
  handValue,
  isBust,
  isBlackjack,
  dealInitialState,
  applyPlayerHit,
  applyDealerTurn,
  applyAction,
} from "@/lib/games/blackjack";
import { BlackjackBot } from "@/lib/bots/blackjack-bot";
import type { Card, GameState } from "@/lib/games/types";

// ── helpers ──────────────────────────────────────────────────────────────────

function card(rank: Card["rank"], suit: Card["suit"] = "spades"): Card {
  return { suit, rank };
}

function stateWith(
  playerCards: Card[],
  dealerCards: Card[],
  deckExtra: Card[] = []
): GameState {
  return {
    gameId: "test",
    status: "in_progress",
    playerHand: { playerId: "p1", isBot: false, cards: playerCards },
    dealerHand: dealerCards,
    deck: deckExtra,
    turn: "player",
  };
}

// ── deck ─────────────────────────────────────────────────────────────────────

describe("buildDeck", () => {
  it("produces 52 unique cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
    expect(keys.size).toBe(52);
  });
});

describe("shuffle", () => {
  it("returns a deck of the same length", () => {
    const deck = buildDeck();
    expect(shuffle(deck)).toHaveLength(52);
  });

  it("does not mutate the original", () => {
    const deck = buildDeck();
    const copy = [...deck];
    shuffle(deck);
    expect(deck).toEqual(copy);
  });
});

// ── card values ───────────────────────────────────────────────────────────────

describe("cardValue", () => {
  it("gives face cards 10", () => {
    expect(cardValue("J")).toBe(10);
    expect(cardValue("Q")).toBe(10);
    expect(cardValue("K")).toBe(10);
  });

  it("gives Ace 11", () => {
    expect(cardValue("A")).toBe(11);
  });

  it("gives number cards their face value", () => {
    expect(cardValue("7")).toBe(7);
    expect(cardValue("10")).toBe(10);
  });
});

describe("handValue", () => {
  it("sums a simple hand", () => {
    expect(handValue([card("7"), card("8")])).toBe(15);
  });

  it("counts Ace as 11 when not busting", () => {
    expect(handValue([card("A"), card("9")])).toBe(20);
  });

  it("counts Ace as 1 to avoid bust", () => {
    expect(handValue([card("A"), card("9"), card("5")])).toBe(15);
  });

  it("handles two Aces correctly", () => {
    // A + A: first 11 + 1 = 12, not bust
    expect(handValue([card("A"), card("A")])).toBe(12);
  });

  it("ignores hidden cards", () => {
    const hidden: Card = { suit: "spades", rank: "K", hidden: true };
    expect(handValue([card("7"), hidden])).toBe(7);
  });
});

describe("isBust", () => {
  it("detects a bust", () => {
    expect(isBust([card("K"), card("Q"), card("5")])).toBe(true);
  });

  it("does not flag 21 as bust", () => {
    expect(isBust([card("K"), card("A")])).toBe(false);
  });
});

describe("isBlackjack", () => {
  it("detects natural blackjack", () => {
    expect(isBlackjack([card("A"), card("K")])).toBe(true);
  });

  it("rejects 21 with 3 cards", () => {
    expect(isBlackjack([card("7"), card("7"), card("7")])).toBe(false);
  });
});

// ── initial deal ──────────────────────────────────────────────────────────────

describe("dealInitialState", () => {
  it("deals 2 cards to player and 2 to dealer", () => {
    const state = dealInitialState("g1", "p1");
    expect(state.playerHand.cards).toHaveLength(2);
    expect(state.dealerHand).toHaveLength(2);
  });

  it("hides dealer hole card", () => {
    const state = dealInitialState("g1", "p1");
    const hidden = state.dealerHand.filter((c) => c.hidden);
    expect(hidden).toHaveLength(1);
  });

  it("leaves 48 cards in deck", () => {
    const state = dealInitialState("g1", "p1");
    expect(state.deck).toHaveLength(48);
  });

  it("starts as player turn", () => {
    const state = dealInitialState("g1", "p1");
    expect(state.turn).toBe("player");
  });
});

// ── hit ───────────────────────────────────────────────────────────────────────

describe("applyPlayerHit", () => {
  it("adds a card to player hand", () => {
    const state = stateWith([card("5"), card("6")], [card("K"), card("7")], [card("3")]);
    const next = applyPlayerHit(state);
    expect(next.playerHand.cards).toHaveLength(3);
  });

  it("marks bust when player exceeds 21", () => {
    const state = stateWith(
      [card("K"), card("Q")],
      [card("K"), card("7")],
      [card("5")]
    );
    const next = applyPlayerHit(state);
    expect(next.status).toBe("player_bust");
    expect(next.turn).toBe("over");
    expect(next.result).toBe("dealer_win");
  });

  it("keeps player turn on non-bust hit", () => {
    const state = stateWith([card("5"), card("6")], [card("K"), card("7")], [card("3")]);
    const next = applyPlayerHit(state);
    expect(next.turn).toBe("player");
  });

  it("is a no-op when turn is not player", () => {
    const state: GameState = { ...stateWith([card("5")], [card("K")]), turn: "over" };
    expect(applyPlayerHit(state)).toBe(state);
  });
});

// ── dealer logic ──────────────────────────────────────────────────────────────

describe("applyDealerTurn", () => {
  it("reveals hole card", () => {
    const dealerCards: Card[] = [card("K"), { ...card("7"), hidden: true }];
    const state: GameState = {
      ...stateWith([card("K"), card("8")], dealerCards, [card("2"), card("3")]),
      turn: "dealer",
    };
    const next = applyDealerTurn(state);
    expect(next.dealerHand.every((c) => !c.hidden)).toBe(true);
  });

  it("dealer hits until 17", () => {
    // Dealer has 12, deck has 3 then 5 → dealer draws once to 15, then 20
    const dealerCards: Card[] = [card("K"), { ...card("2"), hidden: true }];
    const deckCards: Card[] = [card("5"), card("3")]; // pop() from end: 3 first
    const state: GameState = {
      ...stateWith([card("K"), card("8")], dealerCards, deckCards),
      turn: "dealer",
    };
    const next = applyDealerTurn(state);
    expect(handValue(next.dealerHand)).toBeGreaterThanOrEqual(17);
  });

  it("dealer bust gives player win", () => {
    // Dealer: K(10) + 6(hidden) = 16 → must hit → draws 8 → total 24 (bust)
    const dealerCards: Card[] = [card("K"), { ...card("6"), hidden: true }];
    const deckCards: Card[] = [card("8")];
    const state: GameState = {
      ...stateWith([card("K"), card("8")], dealerCards, deckCards),
      turn: "dealer",
    };
    const next = applyDealerTurn(state);
    expect(next.status).toBe("dealer_bust");
    expect(next.result).toBe("player_win");
  });

  it("higher dealer total gives dealer win", () => {
    // Player 18, dealer 20
    const dealerCards: Card[] = [card("K"), { ...card("K"), hidden: true }];
    const state: GameState = {
      ...stateWith([card("K"), card("8")], dealerCards),
      turn: "dealer",
    };
    const next = applyDealerTurn(state);
    expect(next.result).toBe("dealer_win");
  });

  it("equal totals give push", () => {
    const dealerCards: Card[] = [card("K"), { ...card("8"), hidden: true }];
    const state: GameState = {
      ...stateWith([card("K"), card("8")], dealerCards),
      turn: "dealer",
    };
    const next = applyDealerTurn(state);
    expect(next.result).toBe("push");
  });
});

// ── applyAction ───────────────────────────────────────────────────────────────

describe("applyAction", () => {
  it("HIT adds a card", () => {
    const state = stateWith([card("5"), card("6")], [card("K"), card("7")], [card("3")]);
    const next = applyAction(state, { type: "HIT", playerId: "p1" });
    expect(next.playerHand.cards).toHaveLength(3);
  });

  it("STAND triggers dealer turn", () => {
    const state = stateWith([card("K"), card("8")], [card("K"), { ...card("8"), hidden: true }]);
    const next = applyAction(state, { type: "STAND", playerId: "p1" });
    expect(next.turn).toBe("over");
  });

  it("is a no-op when game is over", () => {
    const state: GameState = { ...stateWith([card("5")], [card("K")]), turn: "over" };
    expect(applyAction(state, { type: "HIT", playerId: "p1" })).toBe(state);
  });
});

describe("BlackjackBot", () => {
  it("derives the player hand from state using the shared playerId signature", () => {
    const bot = new BlackjackBot();
    const state = stateWith([card("10"), card("7")], [card("K"), card("7")]);

    const move = bot.getNextMove(state, "p1");

    expect(move).toEqual({ type: "STAND", playerId: "p1" });
  });
});
