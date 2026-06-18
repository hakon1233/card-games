import { describe, expect, it } from "vitest";
import { applyAction, type YanivGameState } from "./yaniv";
import { getTurnClockKey } from "./turn-clock";

function card(suit: "hearts" | "diamonds" | "clubs" | "spades", rank: string) {
  return { suit, rank } as YanivGameState["players"][number]["hand"][number];
}

function headsUpState(): YanivGameState {
  return {
    gameId: "timer-regression",
    status: "in_progress",
    players: [
      {
        id: "player-1",
        name: "You",
        isBot: false,
        hand: [
          card("hearts", "K"),
          card("clubs", "4"),
          card("spades", "2"),
        ],
        score: 0,
        eliminated: false,
      },
      {
        id: "bot-1",
        name: "Bot 1",
        isBot: true,
        hand: [
          card("diamonds", "Q"),
          card("clubs", "7"),
          card("spades", "5"),
        ],
        score: 0,
        eliminated: false,
      },
    ],
    deck: [
      card("hearts", "3"),
      card("diamonds", "A"),
      card("clubs", "9"),
      card("spades", "A"),
    ],
    discardPile: [card("hearts", "8")],
    lastDiscardGroupCount: 1,
    currentPlayerIndex: 0,
    round: 1,
    roundResult: null,
    winnerId: null,
    settings: { yanivThreshold: 7, scoreLimit: 200, quickDraw: false },
    quickDrawWindow: null,
  };
}

describe("getTurnClockKey", () => {
  it("changes when heads-up play returns to the same human index in the same round", () => {
    const firstHumanTurn = headsUpState();
    const firstKey = getTurnClockKey(firstHumanTurn, "player-1");

    const afterHuman = applyAction(firstHumanTurn, {
      type: "DISCARD_AND_DRAW",
      playerId: "player-1",
      discardIndices: [0],
      drawFromDiscard: false,
    });
    const backToHuman = applyAction(afterHuman, {
      type: "DISCARD_AND_DRAW",
      playerId: "bot-1",
      discardIndices: [0],
      drawFromDiscard: false,
    });

    expect(backToHuman.currentPlayerIndex).toBe(firstHumanTurn.currentPlayerIndex);
    expect(backToHuman.round).toBe(firstHumanTurn.round);
    expect(getTurnClockKey(backToHuman, "player-1")).not.toBe(firstKey);
  });
});
