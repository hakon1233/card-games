import { describe, expect, it } from "vitest";
import * as crazyEights from "./crazy-eights";
import * as yaniv from "./yaniv";
import { CrazyEightsBot } from "../bots/crazy-eights-bot";
import { YanivBot } from "../bots/yaniv-bot";
import { botTurn, playBotTurns, MAX_BOT_TURNS, type Bot } from "./bot-turns";
import { seededRng } from "./engine";

const HUMAN = "p1";
const ceBot = new CrazyEightsBot();
const ceBotFor = (id: string) => (id === HUMAN ? undefined : ceBot);

/** A Crazy Eights game in which the human has just drawn, so bot p2 is the active player. */
function crazyEightsAfterHumanDraw(seed: number) {
  const dealt = crazyEights.deal("g", ["p1", "p2", "p3"], [false, true, true], seededRng(seed));
  return crazyEights.apply(dealt, { type: "DRAW_CARD", playerId: HUMAN }, seededRng(seed));
}

describe("botTurn", () => {
  it("makes the active bot's move and returns the state after it", () => {
    const state = crazyEightsAfterHumanDraw(4);
    const turn = botTurn(crazyEights, state, ceBotFor, seededRng(1));

    expect(turn?.action).toEqual(ceBot.getNextMove(state, "p2"));
    expect(turn?.next).toEqual(crazyEights.apply(state, ceBot.getNextMove(state, "p2"), seededRng(1)));
  });

  it("does nothing when a human must act", () => {
    const dealt = crazyEights.deal("g", ["p1", "p2"], [false, true], seededRng(4));
    expect(botTurn(crazyEights, dealt, ceBotFor)).toBeNull();
  });

  it("does nothing once the round is over", () => {
    const state = { ...crazyEightsAfterHumanDraw(4), status: "round_over" as const, winnerId: "p3" };
    expect(botTurn(crazyEights, state, ceBotFor)).toBeNull();
  });
});

describe("playBotTurns", () => {
  it("plays a chain of bots in seat order and stops when the human must act", () => {
    const state = crazyEightsAfterHumanDraw(4);
    const movers: string[] = [];
    const end = playBotTurns(crazyEights, state, ceBotFor, (action) => movers.push(action.playerId), seededRng(5));

    expect(movers).toEqual(["p2", "p3"]);
    expect(crazyEights.activePlayer(end)).toBe(HUMAN);
  });

  it("shows each move the state before and after it", () => {
    const state = crazyEightsAfterHumanDraw(4);
    const seen: { before: crazyEights.CrazyEightsState; after: crazyEights.CrazyEightsState }[] = [];
    const end = playBotTurns(crazyEights, state, ceBotFor, (_, before, after) => seen.push({ before, after }));

    expect(seen[0].before).toBe(state);
    expect(seen[1].before).toBe(seen[0].after);
    expect(seen[1].after).toBe(end);
  });

  it("returns the same state when no bot is to act", () => {
    const dealt = crazyEights.deal("g", ["p1", "p2"], [false, true], seededRng(4));
    expect(playBotTurns(crazyEights, dealt, ceBotFor)).toBe(dealt);
  });

  it("stops after a bounded number of moves at a table of only bots", () => {
    const dealt = yaniv.deal("g", [
      { id: "b1", name: "B1", isBot: true },
      { id: "b2", name: "B2", isBot: true },
    ], undefined, seededRng(6));
    // A bot that never calls Yaniv keeps the round going forever.
    const neverCalls: Bot<yaniv.YanivGameState, yaniv.YanivAction> = {
      getNextMove: (_, playerId) => ({
        type: "DISCARD_AND_DRAW",
        playerId,
        discardIndices: [0],
        drawFromDiscard: false,
      }),
    };
    let moves = 0;
    const end = playBotTurns(yaniv, dealt, () => neverCalls, () => moves++, seededRng(7));

    expect(moves).toBe(MAX_BOT_TURNS);
    expect(yaniv.activePlayer(end)).not.toBeNull();
  });

  it("stops while a Yaniv Quick Draw window is open, after the bot discards", () => {
    const dealt = yaniv.deal(
      "g",
      [
        { id: "p1", name: "You", isBot: false },
        { id: "b1", name: "B1", isBot: true },
      ],
      { ...yaniv.DEFAULT_YANIV_SETTINGS, quickDraw: true },
      seededRng(8),
    );
    const botFirst = { ...dealt, currentPlayerIndex: 1 };
    const holds = new YanivBot(() => 0.99);
    let moves = 0;
    const end = playBotTurns(yaniv, botFirst, (id) => (id === HUMAN ? undefined : holds), () => moves++);

    expect(moves).toBe(1);
    expect(end.quickDrawWindow?.discarderId).toBe("b1");
    expect(yaniv.activePlayer(end)).toBeNull();
  });
});
