import { describe, it, expect } from "vitest";
import { YanivBot } from "./yaniv-bot";
import { dealGame, type YanivSettings } from "../games/yaniv";
import type { Card } from "../games/types";

// Build a 2-player (human + bot) game and drop a specific hand on the bot so we
// can exercise the Yaniv call/hold decision in isolation. The bot is player 1.
function botTurnWithHand(hand: Card[], threshold: number) {
  const settings: YanivSettings = {
    yanivThreshold: threshold,
    scoreLimit: 100,
    quickDraw: false,
  };
  const state = dealGame(
    "bot-pacing",
    [
      { id: "player", name: "Player", isBot: false },
      { id: "bot", name: "Bot", isBot: true },
    ],
    settings,
  );
  state.currentPlayerIndex = 1;
  state.players[1].hand = hand;
  return state;
}

const HOLD = () => 0.99; // above CALL_PROBABILITY -> bot holds
const CALL = () => 0.0; // below CALL_PROBABILITY -> bot calls

describe("YanivBot pacing (GAM-154)", () => {
  it("always calls a near-lock hand (total <= 3) even when rng says hold", () => {
    // A=1 + 2 = 3: unbeatable, no reason to sit on it.
    const state = botTurnWithHand(
      [
        { suit: "hearts", rank: "A" },
        { suit: "clubs", rank: "2" },
      ],
      7,
    );
    const bot = new YanivBot(HOLD);
    expect(bot.getNextMove(state, "bot")).toEqual({ type: "CALL_YANIV", playerId: "bot" });
  });

  it("holds an eligible-but-not-locked hand instead of robo-calling", () => {
    // 4 + A = 5: eligible at threshold 7 but above SNAP_CALL_MAX, so with rng
    // above the call probability the bot keeps playing rather than calling.
    const state = botTurnWithHand(
      [
        { suit: "hearts", rank: "4" },
        { suit: "clubs", rank: "A" },
      ],
      7,
    );
    const bot = new YanivBot(HOLD);
    expect(bot.getNextMove(state, "bot").type).toBe("DISCARD_AND_DRAW");
  });

  it("calls the same eligible hand when rng falls under the call probability", () => {
    const state = botTurnWithHand(
      [
        { suit: "hearts", rank: "4" },
        { suit: "clubs", rank: "A" },
      ],
      7,
    );
    const bot = new YanivBot(CALL);
    expect(bot.getNextMove(state, "bot")).toEqual({ type: "CALL_YANIV", playerId: "bot" });
  });

  it("never calls an ineligible hand regardless of rng", () => {
    // K + Q = 20, well over threshold: must discard, never call.
    const state = botTurnWithHand(
      [
        { suit: "hearts", rank: "K" },
        { suit: "clubs", rank: "Q" },
      ],
      7,
    );
    expect(new YanivBot(CALL).getNextMove(state, "bot").type).toBe("DISCARD_AND_DRAW");
    expect(new YanivBot(HOLD).getNextMove(state, "bot").type).toBe("DISCARD_AND_DRAW");
  });

  it("defaults to Math.random and still returns a legal action", () => {
    const state = botTurnWithHand(
      [
        { suit: "hearts", rank: "5" },
        { suit: "clubs", rank: "3" },
      ],
      7,
    );
    const move = new YanivBot().getNextMove(state, "bot");
    expect(["CALL_YANIV", "DISCARD_AND_DRAW"]).toContain(move.type);
  });
});
