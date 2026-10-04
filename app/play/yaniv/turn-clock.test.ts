import { describe, expect, it } from "vitest";
import { apply, type YanivGameState } from "@/lib/games/yaniv";
import {
  formatQuickDrawTime,
  getTurnClockKey,
  getTurnTimerUrgency,
  shouldPlayLowTimeCue,
} from "./turn-clock";

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

    const afterHuman = apply(firstHumanTurn, {
      type: "DISCARD_AND_DRAW",
      playerId: "player-1",
      discardIndices: [0],
      drawFromDiscard: false,
    });
    const backToHuman = apply(afterHuman, {
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

describe("turn timer UI helpers", () => {
  it("escalates urgency as the turn clock depletes", () => {
    expect(getTurnTimerUrgency(0.8)).toBe("normal");
    expect(getTurnTimerUrgency(0.4)).toBe("warning");
    expect(getTurnTimerUrgency(0.2)).toBe("critical");
  });

  it("plays the low-time cue once when crossing the low-time threshold", () => {
    expect(shouldPlayLowTimeCue({ previousMs: 6100, remainingMs: 5900, thresholdMs: 6000 })).toBe(true);
    expect(shouldPlayLowTimeCue({ previousMs: 5900, remainingMs: 5800, thresholdMs: 6000 })).toBe(false);
    expect(shouldPlayLowTimeCue({ previousMs: null, remainingMs: 5900, thresholdMs: 6000 })).toBe(false);
  });
});

describe("formatQuickDrawTime", () => {
  it("formats remaining quick-draw time in tenths of a second", () => {
    expect(formatQuickDrawTime(2000)).toBe("2.0s");
    expect(formatQuickDrawTime(1750)).toBe("1.8s");
    expect(formatQuickDrawTime(550)).toBe("0.6s");
  });

  it("clamps expired quick-draw time to zero", () => {
    expect(formatQuickDrawTime(0)).toBe("0.0s");
    expect(formatQuickDrawTime(-250)).toBe("0.0s");
  });
});
