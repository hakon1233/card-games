import { describe, expect, it } from "vitest";
import {
  apply,
  cardValue,
  deal,
  handValue,
  isBlackjack,
  isBust,
  type BlackjackState,
} from "./blackjack";
import { seededRng } from "./engine";
import type { Card } from "./types";

const HIT = { type: "HIT", playerId: "p1" } as const;
const STAND = { type: "STAND", playerId: "p1" } as const;

function card(rank: Card["rank"], suit: Card["suit"] = "hearts"): Card {
  return { rank, suit };
}

function makeState(overrides: Partial<BlackjackState> = {}): BlackjackState {
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

describe("deal", () => {
  // Seeds found by search: seed 2 deals no natural; 7, 1 and 26 deal the named natural(s).
  it("deals 2 cards to the player and 2 to the dealer, leaving 48 in the draw pile", () => {
    const state = deal("g1", "p1", seededRng(2));
    expect(state.playerHand.cards).toHaveLength(2);
    expect(state.dealerHand).toHaveLength(2);
    expect(state.deck).toHaveLength(48);
  });

  it("settles a player natural at the deal as a win", () => {
    const state = deal("g1", "p1", seededRng(7));
    expect(isBlackjack(state.playerHand.cards)).toBe(true);
    expect(state).toMatchObject({ turn: "over", status: "player_win", result: "player_win" });
    expect(state.dealerHand.every((c) => !c.hidden)).toBe(true);
  });

  it("settles a dealer natural at the deal as a loss", () => {
    const state = deal("g1", "p1", seededRng(1));
    expect(isBlackjack(state.dealerHand)).toBe(true);
    expect(state).toMatchObject({ turn: "over", status: "dealer_win", result: "dealer_win" });
  });

  it("settles two naturals at the deal as a push", () => {
    const state = deal("g1", "p1", seededRng(26));
    expect(isBlackjack(state.playerHand.cards)).toBe(true);
    expect(state).toMatchObject({ turn: "over", status: "push", result: "push" });
  });

  it("leaves a deal without a natural in progress with the hole card hidden", () => {
    const state = deal("g1", "p1", seededRng(2));
    expect(state).toMatchObject({ turn: "player", status: "in_progress" });
    expect(state.dealerHand.filter((c) => c.hidden)).toHaveLength(1);
  });
});

describe("apply: HIT", () => {
  it("adds a card to player hand (pops from deck end)", () => {
    const state = makeState({ deck: [card("2"), card("J")] }); // J drawn first (end)
    const next = apply(state, HIT);
    expect(next.playerHand.cards).toHaveLength(3);
    expect(next.playerHand.cards[2]).toEqual(card("J"));
  });

  it("keeps the player's turn after a hit that does not bust", () => {
    const next = apply(makeState({ deck: [card("3")] }), HIT);
    expect(next.turn).toBe("player");
    expect(next.status).toBe("in_progress");
  });

  it("resolves player_bust when hand exceeds 21", () => {
    const bustState = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("9")] },
      deck: [card("5")],
    });
    const next = apply(bustState, HIT);
    expect(next.status).toBe("player_bust");
    expect(next.result).toBe("dealer_win");
    expect(next.turn).toBe("over");
  });

  it("ignores HIT when game is over", () => {
    const over = makeState({ turn: "over", status: "player_win", result: "player_win" });
    expect(apply(over, HIT)).toBe(over);
  });
});

describe("apply: STAND (the dealer's turn)", () => {
  it("dealer draws on a sub-17 complete hand (hole card included), then reveals", () => {
    // Dealer 9 + 6(hidden) = 15 complete < 17 → draw 5 (deck end) → 9+6+5 = 20 ≥ 17 → stop.
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("8")] },
      dealerHand: [card("9"), { ...card("6"), hidden: true }],
      deck: [card("2"), card("5")],
      turn: "dealer",
    });
    const next = apply(state, STAND);
    expect(next.dealerHand.every((c) => !c.hidden)).toBe(true);
    expect(handValue(next.dealerHand)).toBe(20);
    expect(next.turn).toBe("over");
  });

  it("dealer keeps drawing until its complete hand reaches 17", () => {
    // Dealer K + 2(hidden) = 12 → draws 3 (deck end) → 15 → draws 5 → 20.
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("8")] },
      dealerHand: [card("K"), { ...card("2"), hidden: true }],
      deck: [card("5"), card("3")],
      turn: "dealer",
    });
    const next = apply(state, STAND);
    expect(next.dealerHand).toHaveLength(4);
    expect(handValue(next.dealerHand)).toBe(20);
  });

  it("dealer busts when drawn cards push over 21", () => {
    // Dealer 9 + 6(hidden) = 15 complete < 17 → draw K (end) → 9+6+K = 25 → bust.
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("8")] },
      dealerHand: [card("9"), { ...card("6"), hidden: true }],
      deck: [card("K")],
      turn: "dealer",
    });
    const next = apply(state, STAND);
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
        const next = apply(state, STAND);
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
    const next = apply(state, STAND);
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
    const next = apply(state, STAND);
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
    const next = apply(state, STAND);
    expect(next.status).toBe("dealer_win");
    expect(next.result).toBe("dealer_win");
  });
});

describe("apply: STAND and START", () => {
  it("STAND on the player's turn runs the dealer's turn and ends the game", () => {
    const state = makeState({
      playerHand: { playerId: "p1", isBot: false, cards: [card("K"), card("8")] },
      dealerHand: [card("K"), { ...card("8"), hidden: true }],
      deck: [],
    });
    expect(apply(state, STAND).turn).toBe("over");
  });

  it("START deals a fresh game", () => {
    const over = makeState({ turn: "over", status: "player_win", result: "player_win" });
    const next = apply(over, { type: "START", playerId: "p1" });
    expect(next.playerHand.cards).toHaveLength(2);
  });
});
