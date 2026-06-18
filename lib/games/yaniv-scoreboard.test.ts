import { describe, expect, it } from "vitest";

import { getYanivScoreboardRows } from "./yaniv-scoreboard";
import type { YanivGameState } from "./yaniv";

const baseState: YanivGameState = {
  gameId: "scoreboard",
  status: "round_over",
  players: [
    {
      id: "caller",
      name: "Caller",
      isBot: false,
      hand: [{ suit: "hearts", rank: "7" }],
      score: 40,
      eliminated: false,
    },
    {
      id: "winner",
      name: "Winner",
      isBot: true,
      hand: [{ suit: "clubs", rank: "6" }],
      score: 20,
      eliminated: false,
    },
    {
      id: "danger",
      name: "Danger",
      isBot: true,
      hand: [{ suit: "diamonds", rank: "9" }],
      score: 94,
      eliminated: false,
    },
  ],
  deck: [],
  discardPile: [],
  lastDiscardGroupCount: 1,
  currentPlayerIndex: 0,
  round: 3,
  roundResult: {
    callerId: "caller",
    assaf: true,
    handTotals: {
      caller: 7,
      winner: 6,
      danger: 9,
    },
    scoreDeltas: {
      caller: 30,
      winner: 0,
      danger: 9,
    },
  },
  winnerId: null,
  settings: { yanivThreshold: 7, scoreLimit: 100, quickDraw: false },
  quickDrawWindow: null,
};

describe("getYanivScoreboardRows", () => {
  it("shows cumulative scores with the scoring delta applied this round", () => {
    expect(getYanivScoreboardRows(baseState)).toMatchObject([
      {
        id: "caller",
        name: "Caller",
        handTotal: 7,
        roundDelta: 30,
        cumulativeScore: 40,
        thresholdState: "safe",
      },
      {
        id: "winner",
        name: "Winner",
        handTotal: 6,
        roundDelta: 0,
        cumulativeScore: 20,
        thresholdState: "safe",
      },
      {
        id: "danger",
        name: "Danger",
        handTotal: 9,
        roundDelta: 9,
        cumulativeScore: 94,
        thresholdState: "warning",
      },
    ]);
  });

  it("marks eliminated players as busted even when they are no longer active", () => {
    const rows = getYanivScoreboardRows({
      ...baseState,
      players: [
        ...baseState.players.slice(0, 2),
        { ...baseState.players[2], score: 104, eliminated: true },
      ],
    });

    expect(rows[2]).toMatchObject({
      id: "danger",
      roundDelta: 9,
      cumulativeScore: 104,
      thresholdState: "busted",
    });
  });

  it("surfaces a negative delta when the engine halved a player's score (50 -> 25)", () => {
    const rows = getYanivScoreboardRows({
      ...baseState,
      players: [
        { ...baseState.players[0], score: 25 },
        ...baseState.players.slice(1),
      ],
      roundResult: {
        ...baseState.roundResult!,
        scoreDeltas: { ...baseState.roundResult!.scoreDeltas, caller: -25 },
      },
    });

    // The displayed delta reconciles with the cumulative total the engine kept.
    expect(rows[0]).toMatchObject({ id: "caller", roundDelta: -25, cumulativeScore: 25 });
  });
});
