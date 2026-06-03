import { describe, it, expect } from "vitest";
import {
  dealGame,
  isPlayable,
  applyPlayCard,
  applyDrawCard,
  topCard,
  effectiveSuit,
} from "@/lib/games/crazy-eights";
import type { CrazyEightsState } from "@/lib/games/crazy-eights";
import { CrazyEightsBot } from "@/lib/bots/crazy-eights-bot";

function makeState(overrides: Partial<CrazyEightsState> = {}): CrazyEightsState {
  return {
    gameId: "test",
    status: "in_progress",
    players: [
      { id: "p1", isBot: false, hand: [], roundWins: 0 },
      { id: "p2", isBot: true, hand: [], roundWins: 0 },
    ],
    deck: [],
    discardPile: [{ suit: "hearts", rank: "5" }],
    currentPlayerIndex: 0,
    declaredSuit: null,
    winnerId: null,
    ...overrides,
  };
}

describe("dealGame", () => {
  it("deals 7 cards per player", () => {
    const state = dealGame("g1", ["p1", "p2"], [false, true]);
    expect(state.players[0].hand).toHaveLength(7);
    expect(state.players[1].hand).toHaveLength(7);
  });

  it("discard pile starts with a non-8 card", () => {
    for (let i = 0; i < 20; i++) {
      const state = dealGame("g1", ["p1", "p2"], [false, true]);
      expect(topCard(state).rank).not.toBe("8");
    }
  });

  it("supports 2–4 players", () => {
    const s2 = dealGame("g1", ["p1", "p2"], [false, false]);
    const s4 = dealGame("g1", ["p1", "p2", "p3", "p4"], [false, false, false, false]);
    expect(s2.players).toHaveLength(2);
    expect(s4.players).toHaveLength(4);
  });

  it("total dealt cards + deck + discard = 52", () => {
    const state = dealGame("g1", ["p1", "p2"], [false, false]);
    const inHands = state.players.reduce((sum, p) => sum + p.hand.length, 0);
    expect(inHands + state.deck.length + state.discardPile.length).toBe(52);
  });
});

describe("isPlayable", () => {
  it("allows matching suit", () => {
    const state = makeState({ discardPile: [{ suit: "hearts", rank: "5" }] });
    expect(isPlayable({ suit: "hearts", rank: "3" }, state)).toBe(true);
  });

  it("allows matching rank", () => {
    const state = makeState({ discardPile: [{ suit: "hearts", rank: "5" }] });
    expect(isPlayable({ suit: "spades", rank: "5" }, state)).toBe(true);
  });

  it("allows 8 regardless of top card", () => {
    const state = makeState({ discardPile: [{ suit: "hearts", rank: "5" }] });
    expect(isPlayable({ suit: "clubs", rank: "8" }, state)).toBe(true);
  });

  it("blocks non-matching card", () => {
    const state = makeState({ discardPile: [{ suit: "hearts", rank: "5" }] });
    expect(isPlayable({ suit: "spades", rank: "3" }, state)).toBe(false);
  });

  it("respects declared suit from previous 8", () => {
    const state = makeState({
      discardPile: [{ suit: "hearts", rank: "8" }],
      declaredSuit: "clubs",
    });
    expect(isPlayable({ suit: "clubs", rank: "K" }, state)).toBe(true);
    expect(isPlayable({ suit: "hearts", rank: "K" }, state)).toBe(false);
  });

  it("rank still matches even when suit declared", () => {
    const state = makeState({
      discardPile: [{ suit: "hearts", rank: "8" }],
      declaredSuit: "clubs",
    });
    // Top card is an 8, declared suit is clubs — matching rank "8" is handled by wild rule
    // A non-8 matching clubs suit
    expect(isPlayable({ suit: "clubs", rank: "3" }, state)).toBe(true);
  });
});

describe("effectiveSuit", () => {
  it("returns declared suit when set", () => {
    const state = makeState({
      discardPile: [{ suit: "hearts", rank: "8" }],
      declaredSuit: "spades",
    });
    expect(effectiveSuit(state)).toBe("spades");
  });

  it("returns top card suit when no declared suit", () => {
    const state = makeState({ discardPile: [{ suit: "diamonds", rank: "7" }] });
    expect(effectiveSuit(state)).toBe("diamonds");
  });
});

describe("applyPlayCard", () => {
  it("plays a valid card and advances turn", () => {
    const state = makeState({
      players: [
        {
          id: "p1",
          isBot: false,
          hand: [{ suit: "hearts", rank: "3" }, { suit: "clubs", rank: "K" }],
          roundWins: 0,
        },
        { id: "p2", isBot: true, hand: [{ suit: "spades", rank: "K" }], roundWins: 0 },
      ],
      discardPile: [{ suit: "hearts", rank: "5" }],
    });

    const next = applyPlayCard(state, "p1", 0);
    expect(topCard(next)).toEqual({ suit: "hearts", rank: "3" });
    expect(next.players[0].hand).toHaveLength(1);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it("rejects play from wrong player", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [{ suit: "hearts", rank: "3" }], roundWins: 0 },
        { id: "p2", isBot: true, hand: [{ suit: "hearts", rank: "3" }], roundWins: 0 },
      ],
      currentPlayerIndex: 0,
    });

    const next = applyPlayCard(state, "p2", 0);
    expect(next).toBe(state);
  });

  it("rejects invalid card", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [{ suit: "spades", rank: "3" }], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      discardPile: [{ suit: "hearts", rank: "5" }],
    });

    const next = applyPlayCard(state, "p1", 0);
    expect(next).toBe(state);
  });

  it("sets round_over when player empties hand and increments roundWins", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [{ suit: "hearts", rank: "5" }], roundWins: 0 },
        { id: "p2", isBot: true, hand: [{ suit: "spades", rank: "K" }], roundWins: 0 },
      ],
      discardPile: [{ suit: "hearts", rank: "3" }],
    });

    const next = applyPlayCard(state, "p1", 0);
    expect(next.status).toBe("round_over");
    expect(next.winnerId).toBe("p1");
    expect(next.players[0].roundWins).toBe(1);
  });

  it("playing an 8 without declaredSuit is rejected", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [{ suit: "hearts", rank: "8" }], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      discardPile: [{ suit: "clubs", rank: "5" }],
    });

    const next = applyPlayCard(state, "p1", 0);
    expect(next).toBe(state);
  });

  it("playing an 8 with declaredSuit sets declaredSuit", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [{ suit: "hearts", rank: "8" }], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      discardPile: [{ suit: "clubs", rank: "5" }],
    });

    const next = applyPlayCard(state, "p1", 0, "spades");
    expect(next.declaredSuit).toBe("spades");
    expect(topCard(next).rank).toBe("8");
  });

  it("playing a non-8 clears declaredSuit", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [{ suit: "clubs", rank: "7" }], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      discardPile: [{ suit: "hearts", rank: "8" }],
      declaredSuit: "clubs",
    });

    const next = applyPlayCard(state, "p1", 0);
    expect(next.declaredSuit).toBeNull();
  });

  it("does nothing if game is not in_progress", () => {
    const state = makeState({
      status: "round_over",
      players: [
        { id: "p1", isBot: false, hand: [{ suit: "hearts", rank: "5" }], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
    });

    const next = applyPlayCard(state, "p1", 0);
    expect(next).toBe(state);
  });
});

describe("applyDrawCard", () => {
  it("adds a card to player hand and advances turn", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      deck: [{ suit: "spades", rank: "K" }],
      discardPile: [{ suit: "hearts", rank: "5" }],
    });

    const next = applyDrawCard(state, "p1");
    expect(next.players[0].hand).toHaveLength(1);
    expect(next.deck).toHaveLength(0);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it("reshuffles discard pile when deck is empty", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      deck: [],
      discardPile: [
        { suit: "hearts", rank: "3" },
        { suit: "clubs", rank: "7" },
        { suit: "spades", rank: "5" },
      ],
    });

    const next = applyDrawCard(state, "p1");
    expect(next.players[0].hand).toHaveLength(1);
    expect(next.discardPile).toHaveLength(1);
    expect(next.discardPile[0]).toEqual({ suit: "spades", rank: "5" });
  });

  it("skips turn when deck and discard are empty", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      deck: [],
      discardPile: [{ suit: "hearts", rank: "5" }],
    });

    const next = applyDrawCard(state, "p1");
    expect(next.players[0].hand).toHaveLength(0);
    expect(next.currentPlayerIndex).toBe(1);
  });

  it("rejects draw from wrong player", () => {
    const state = makeState({
      players: [
        { id: "p1", isBot: false, hand: [], roundWins: 0 },
        { id: "p2", isBot: true, hand: [], roundWins: 0 },
      ],
      deck: [{ suit: "spades", rank: "K" }],
      currentPlayerIndex: 0,
    });

    const next = applyDrawCard(state, "p2");
    expect(next).toBe(state);
  });
});

describe("CrazyEightsBot", () => {
  const bot = new CrazyEightsBot();

  it("plays a non-8 card when available", () => {
    const state = makeState({
      players: [
        {
          id: "p1",
          isBot: true,
          hand: [
            { suit: "hearts", rank: "8" },
            { suit: "hearts", rank: "3" },
          ],
          roundWins: 0,
        },
        { id: "p2", isBot: false, hand: [], roundWins: 0 },
      ],
      discardPile: [{ suit: "hearts", rank: "5" }],
    });

    const action = bot.getNextMove(state, "p1");
    expect(action.type).toBe("PLAY_CARD");
    if (action.type === "PLAY_CARD") {
      expect(state.players[0].hand[action.cardIndex].rank).not.toBe("8");
    }
  });

  it("plays an 8 and declares most-common suit when no other play", () => {
    const state = makeState({
      players: [
        {
          id: "p1",
          isBot: true,
          hand: [
            { suit: "hearts", rank: "8" },
            { suit: "spades", rank: "A" },
            { suit: "spades", rank: "K" },
          ],
          roundWins: 0,
        },
        { id: "p2", isBot: false, hand: [], roundWins: 0 },
      ],
      discardPile: [{ suit: "clubs", rank: "5" }],
    });

    const action = bot.getNextMove(state, "p1");
    expect(action.type).toBe("PLAY_CARD");
    if (action.type === "PLAY_CARD") {
      expect(state.players[0].hand[action.cardIndex].rank).toBe("8");
      expect(action.declaredSuit).toBe("spades");
    }
  });

  it("draws when no playable card", () => {
    const state = makeState({
      players: [
        {
          id: "p1",
          isBot: true,
          hand: [
            { suit: "spades", rank: "3" },
            { suit: "diamonds", rank: "K" },
          ],
          roundWins: 0,
        },
        { id: "p2", isBot: false, hand: [], roundWins: 0 },
      ],
      discardPile: [{ suit: "hearts", rank: "5" }],
    });

    const action = bot.getNextMove(state, "p1");
    expect(action.type).toBe("DRAW_CARD");
  });

  it("bot plays valid move deterministically", () => {
    const state = makeState({
      players: [
        {
          id: "p1",
          isBot: true,
          hand: [{ suit: "hearts", rank: "J" }],
          roundWins: 0,
        },
        { id: "p2", isBot: false, hand: [{ suit: "clubs", rank: "2" }], roundWins: 0 },
      ],
      discardPile: [{ suit: "hearts", rank: "9" }],
    });

    const action1 = bot.getNextMove(state, "p1");
    const action2 = bot.getNextMove(state, "p1");
    expect(action1).toEqual(action2);
  });
});

describe("full round simulation", () => {
  it("plays a round to completion with bot vs bot", () => {
    const state = dealGame("sim", ["p1", "p2"], [true, true]);
    const bot = new CrazyEightsBot();

    let s = state;
    let turns = 0;
    const maxTurns = 500;

    while (s.status === "in_progress" && turns < maxTurns) {
      const current = s.players[s.currentPlayerIndex];
      const action = bot.getNextMove(s, current.id);
      if (action.type === "PLAY_CARD") {
        s = applyPlayCard(s, action.playerId, action.cardIndex, action.declaredSuit);
      } else {
        s = applyDrawCard(s, action.playerId);
      }
      turns++;
    }

    expect(s.status).toBe("round_over");
    expect(s.winnerId).not.toBeNull();
  });
});
