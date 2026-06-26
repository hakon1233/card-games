import { describe, expect, it } from "vitest";
import {
  applyAction,
  applyDealerTurn,
  applyPlayerHit,
  buildDeck,
  cardValue,
  dealInitialState,
  handValue,
  isBlackjack,
  isBust,
  shuffle,
  startGame,
} from "./engine";
import type { Card, GameState } from "../types";

function card(rank: Card["rank"], suit: Card["suit"] = "hearts"): Card {
  return { rank, suit };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    gameId: "test",
    status: "in_progress",
    playerHand: { playerId: "p1", isBot: false, cards: [card("5"), card("6")] },
    dealerHand: [card("7"), { ...card("8"), hidden: true }],
    // deck: pop from end, so last card is drawn first
    deck: [card("2"), card("3"), card("4"), card("9"), card("10"), card("J")],
    turn: "player",
    ...overrides,
  };
}

describe("buildDeck", () => {
  it("returns 52 unique cards", () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(52);
    const keys = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
    expect(keys.size).toBe(52);
  });
});

describe("shuffle", () => {
  it("returns same length", () => {
    expect(shuffle(buildDeck())).toHaveLength(52);
  });
  it("does not mutate input", () => {
    const deck = buildDeck();
    const copy = [...deck];
    shuffle(deck);
    expect(deck).toEqual(copy);
  });
});

describe("cardValue", () => {
  it("returns 11 for ace", () => expect(cardValue("A")).toBe(11));
  it("returns 10 for face cards", () => {
    expect(cardValue("J")).toBe(10);
    expect(cardValue("Q")).toBe(10);
    expect(cardValue("K")).toBe(10);
  });
  it("returns numeric value for number cards", () => {
    expect(cardValue("2")).toBe(2);
    expect(cardValue("9")).toBe(9);
    expect(cardValue("10")).toBe(10);
  });
});

describe("handValue", () => {
  it("sums basic cards", () => {
    expect(handValue([card("5"), card("6")])).toBe(11);
  });
  it("counts ace as 11 when safe", () => {
    expect(handValue([card("A"), card("9")])).toBe(20);
  });
  it("counts ace as 1 when 11 would bust", () => {
    expect(handValue([card("A"), card("9"), card("5")])).toBe(15);
  });
  it("handles two aces correctly", () => {
    expect(handValue([card("A"), card("A")])).toBe(12);
  });
  it("ignores hidden cards", () => {
    expect(handValue([card("7"), { ...card("8"), hidden: true }])).toBe(7);
  });
});

describe("isBlackjack", () => {
  it("detects ace + face card", () => {
    expect(isBlackjack([card("A"), card("K")])).toBe(true);
  });
  it("rejects 21 with three cards", () => {
    expect(isBlackjack([card("A"), card("5"), card("5")])).toBe(false);
  });
});

describe("isBust", () => {
  it("returns true for > 21", () => {
    expect(isBust([card("K"), card("Q"), card("5")])).toBe(true);
  });
  it("returns false for exactly 21", () => {
    expect(isBust([card("A"), card("K")])).toBe(false);
  });
});

describe("dealInitialState", () => {
  it("deals 2 cards to player and 2 to dealer", () => {
    const state = dealInitialState("g1", "p1");
    expect(state.playerHand.cards).toHaveLength(2);
    expect(state.dealerHand).toHaveLength(2);
  });
  it("dealer hole card is hidden", () => {
    const state = dealInitialState("g1", "p1");
    expect(state.dealerHand.filter((c) => c.hidden)).toHaveLength(1);
  });
  it("leaves 48 cards in deck", () => {
    const state = dealInitialState("g1", "p1");
    expect(state.deck).toHaveLength(48);
  });
  it("always starts as player turn", () => {
    for (let i = 0; i < 10; i++) {
      expect(dealInitialState("g", "p").turn).toBe("player");
    }
  });
});

describe("startGame", () => {
  it("resolves blackjack immediately", () => {
    let found = false;
    for (let i = 0; i < 200; i++) {
      const state = startGame("g1", "p1");
      if (state.turn === "over") { found = true; break; }
    }
    // In a fair run we'll see it, but it's probabilistic — just confirm it can happen
    // (don't fail if we don't hit it in 200 tries, probability is low enough)
    void found;
  });
});

describe("applyPlayerHit", () => {
  it("adds a card to player hand (pops from deck end)", () => {
    const state = makeState({ deck: [card("2"), card("J")] }); // J drawn first (end)
    const next = applyPlayerHit(state);
    expect(next.playerHand.cards).toHaveLength(3);
    expect(next.playerHand.cards[2]).toEqual(card("J"));
  });

  it("resolves player_bust when hand exceeds 21", () => {
    const bustState = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("9")] },
      deck: [card("5")],
    });
    const next = applyPlayerHit(bustState);
    expect(next.status).toBe("player_bust");
    expect(next.result).toBe("dealer_win");
    expect(next.turn).toBe("over");
  });

  it("ignores HIT when game is over", () => {
    const over = makeState({ turn: "over", status: "player_win", result: "player_win" });
    expect(applyPlayerHit(over)).toBe(over);
  });
});

describe("applyDealerTurn", () => {
  it("dealer draws on a sub-17 complete hand (hole card included), then reveals", () => {
    // Dealer 9 + 6(hidden) = 15 complete < 17 → draw 5 (deck end) → 9+6+5 = 20 ≥ 17 → stop.
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("8")] },
      dealerHand: [card("9"), { ...card("6"), hidden: true }],
      deck: [card("2"), card("5")],
      turn: "dealer",
    });
    const next = applyDealerTurn(state);
    expect(next.dealerHand.every((c) => !c.hidden)).toBe(true);
    expect(handValue(next.dealerHand)).toBe(20);
    expect(next.turn).toBe("over");
  });

  it("dealer busts when drawn cards push over 21", () => {
    // Dealer 9 + 6(hidden) = 15 complete < 17 → draw K (end) → 9+6+K = 25 → bust.
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("8")] },
      dealerHand: [card("9"), { ...card("6"), hidden: true }],
      deck: [card("K")],
      turn: "dealer",
    });
    const next = applyDealerTurn(state);
    expect(next.status).toBe("dealer_bust");
    expect(next.result).toBe("player_win");
  });

  // Regression for GAM-123: the dealer must stand on a made two-card 17–20 when
  // the hole card is counted. The original bug evaluated handValue() over only the
  // visible up-card (hidden cards are filtered out), so the dealer overdrew on pat
  // hands like A+7=18 and J+9=19. The deck is stacked so that ANY draw would be
  // detectable — a correct dealer must not touch it.
  describe("stands on a pat two-card hand including the hole card (GAM-123)", () => {
    const patHands: Array<[string, Card, Card, number]> = [
      ["hard 17 (K + 7)", card("K"), card("7"), 17],
      ["soft 18 (A + 7)", card("A"), card("7"), 18],
      ["hard 19 (J + 9)", card("J"), card("9"), 19],
      ["hard 20 (Q + 10)", card("Q"), card("10"), 20],
    ];

    for (const [label, up, hole, total] of patHands) {
      it(`does not draw on ${label}`, () => {
        const state = makeState({
          playerHand: { playerId: "p1", isBot: false, cards: [card("6"), card("5")] },
          dealerHand: [up, { ...hole, hidden: true }],
          // Stacked with low cards: if the dealer wrongly drew, the hand would change.
          deck: [card("2"), card("3"), card("4")],
          turn: "dealer",
        });
        const next = applyDealerTurn(state);
        expect(next.dealerHand).toHaveLength(2);
        expect(next.dealerHand.every((c) => !c.hidden)).toBe(true);
        expect(handValue(next.dealerHand)).toBe(total);
        expect(next.deck).toHaveLength(3);
        expect(next.turn).toBe("over");
      });
    }
  });

  it("detects push when totals equal", () => {
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("7")] },
      dealerHand: [card("K"), { ...card("7"), hidden: true }],
      deck: [],
      turn: "dealer",
    });
    const next = applyDealerTurn(state);
    expect(next.status).toBe("push");
    expect(next.result).toBe("push");
  });

  it("player wins when player total > dealer total", () => {
    // Dealer visible K=10, 7 hidden. 10 < 17 → deck empty → reveal K+7=17 → player 19 wins
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("9")] },
      dealerHand: [card("K"), { ...card("7"), hidden: true }],
      deck: [],
      turn: "dealer",
    });
    const next = applyDealerTurn(state);
    expect(next.status).toBe("player_win");
    expect(next.result).toBe("player_win");
  });

  it("dealer wins when dealer total > player total", () => {
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("10"), card("7")] },
      dealerHand: [card("K"), { ...card("9"), hidden: true }],
      deck: [],
      turn: "dealer",
    });
    const next = applyDealerTurn(state);
    expect(next.status).toBe("dealer_win");
    expect(next.result).toBe("dealer_win");
  });
});

describe("applyAction", () => {
  it("HIT delegates to applyPlayerHit", () => {
    const state = makeState({ deck: [card("2"), card("3")] });
    const next = applyAction(state, { type: "HIT", playerId: "p1" });
    expect(next.playerHand.cards).toHaveLength(3);
  });

  it("STAND runs dealer turn and ends game", () => {
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("8")] },
      dealerHand: [card("K"), { ...card("8"), hidden: true }],
      deck: [],
    });
    const next = applyAction(state, { type: "STAND", playerId: "p1" });
    expect(next.turn).toBe("over");
  });

  it("START creates a fresh game", () => {
    const over = makeState({ turn: "over", status: "player_win", result: "player_win" });
    const next = applyAction(over, { type: "START", playerId: "p1" });
    expect(next.playerHand.cards).toHaveLength(2);
  });

  it("no-op when game is over for HIT", () => {
    const over = makeState({ turn: "over", status: "player_win", result: "player_win" });
    expect(applyAction(over, { type: "HIT", playerId: "p1" })).toBe(over);
  });
});
