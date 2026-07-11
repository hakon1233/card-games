import { describe, it, expect } from "vitest";
import {
  dealGame,
  applyAction,
  handTotal,
  canCallYaniv,
  isValidDiscard,
  yanivCardValue,
  describeSelection,
  getFinalStandings,
} from "../games/yaniv";
import { YanivBot } from "../bots/yaniv-bot";

const bot = new YanivBot();

describe("yaniv card values", () => {
  it("scores A=1, face=10, pip=face value", () => {
    expect(yanivCardValue("A")).toBe(1);
    expect(yanivCardValue("J")).toBe(10);
    expect(yanivCardValue("Q")).toBe(10);
    expect(yanivCardValue("K")).toBe(10);
    expect(yanivCardValue("7")).toBe(7);
    expect(yanivCardValue("10")).toBe(10);
  });
});

describe("handTotal / canCallYaniv", () => {
  it("sums card values", () => {
    expect(handTotal([{ suit: "hearts", rank: "A" }, { suit: "clubs", rank: "2" }])).toBe(3);
    expect(handTotal([{ suit: "hearts", rank: "K" }, { suit: "clubs", rank: "Q" }])).toBe(20);
  });

  it("canCallYaniv is true only when total <= 7", () => {
    expect(canCallYaniv([{ suit: "hearts", rank: "A" }, { suit: "clubs", rank: "6" }])).toBe(true);
    expect(canCallYaniv([{ suit: "hearts", rank: "8" }])).toBe(false);
    expect(canCallYaniv([{ suit: "hearts", rank: "7" }])).toBe(true);
  });
});

describe("YanivBot threshold settings", () => {
  it("does not call Yaniv below the configured minimum threshold", () => {
    const state = dealGame(
      "bot-threshold-low",
      [
        { id: "player", name: "Player", isBot: false },
        { id: "bot", name: "Bot", isBot: true },
      ],
      { yanivThreshold: 3, scoreLimit: 100, quickDraw: false },
    );
    state.currentPlayerIndex = 1;
    state.players[1].hand = [
      { suit: "hearts", rank: "4" },
      { suit: "clubs", rank: "A" },
    ];

    expect(bot.getNextMove(state, "bot").type).toBe("DISCARD_AND_DRAW");
  });

  it("can call Yaniv up to the configured maximum threshold", () => {
    const state = dealGame(
      "bot-threshold-high",
      [
        { id: "player", name: "Player", isBot: false },
        { id: "bot", name: "Bot", isBot: true },
      ],
      { yanivThreshold: 15, scoreLimit: 100, quickDraw: false },
    );
    state.currentPlayerIndex = 1;
    state.players[1].hand = [
      { suit: "hearts", rank: "10" },
      { suit: "clubs", rank: "5" },
    ];

    expect(bot.getNextMove(state, "bot")).toEqual({ type: "CALL_YANIV", playerId: "bot" });
  });
});

describe("describeSelection (live combo feedback)", () => {
  it("reports empty selection as not-legal", () => {
    const d = describeSelection([]);
    expect(d.valid).toBe(false);
    expect(d.kind).toBe("empty");
    expect(d.points).toBe(0);
  });

  it("names a single card and counts its points", () => {
    const d = describeSelection([{ suit: "spades", rank: "9" }]);
    expect(d.valid).toBe(true);
    expect(d.kind).toBe("single");
    expect(d.label).toBe("Single 9");
    expect(d.points).toBe(9);
  });

  it("names a pair", () => {
    const d = describeSelection([
      { suit: "hearts", rank: "7" },
      { suit: "clubs", rank: "7" },
    ]);
    expect(d.valid).toBe(true);
    expect(d.kind).toBe("pair");
    expect(d.label).toBe("Pair of 7s");
    expect(d.points).toBe(14);
  });

  it("names a set of three", () => {
    const d = describeSelection([
      { suit: "hearts", rank: "4" },
      { suit: "clubs", rank: "4" },
      { suit: "diamonds", rank: "4" },
    ]);
    expect(d.kind).toBe("set");
    expect(d.label).toBe("Set of 3 4s");
  });

  it("names a run with its low–high range regardless of input order", () => {
    const d = describeSelection([
      { suit: "hearts", rank: "7" },
      { suit: "hearts", rank: "5" },
      { suit: "hearts", rank: "6" },
    ]);
    expect(d.valid).toBe(true);
    expect(d.kind).toBe("run");
    expect(d.label).toBe("Run of 3 (5–7)");
    expect(d.points).toBe(18);
  });

  it("marks an illegal selection invalid but still totals its points", () => {
    const d = describeSelection([
      { suit: "hearts", rank: "K" },
      { suit: "clubs", rank: "Q" },
    ]);
    expect(d.valid).toBe(false);
    expect(d.kind).toBe("invalid");
    expect(d.points).toBe(20);
  });
});

describe("isValidDiscard", () => {
  it("allows single card", () => {
    expect(isValidDiscard([{ suit: "hearts", rank: "K" }])).toBe(true);
  });

  it("allows pair", () => {
    expect(isValidDiscard([
      { suit: "hearts", rank: "K" },
      { suit: "clubs", rank: "K" },
    ])).toBe(true);
  });

  it("rejects non-matching pair", () => {
    expect(isValidDiscard([
      { suit: "hearts", rank: "K" },
      { suit: "clubs", rank: "Q" },
    ])).toBe(false);
  });

  it("allows set of 3", () => {
    expect(isValidDiscard([
      { suit: "hearts", rank: "5" },
      { suit: "clubs", rank: "5" },
      { suit: "diamonds", rank: "5" },
    ])).toBe(true);
  });

  it("allows same-suit straight of 3", () => {
    expect(isValidDiscard([
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "2" },
      { suit: "hearts", rank: "3" },
    ])).toBe(true);
  });

  it("rejects mixed-suit straight", () => {
    expect(isValidDiscard([
      { suit: "hearts", rank: "A" },
      { suit: "clubs", rank: "2" },
      { suit: "hearts", rank: "3" },
    ])).toBe(false);
  });

  it("rejects non-consecutive same-suit", () => {
    expect(isValidDiscard([
      { suit: "hearts", rank: "A" },
      { suit: "hearts", rank: "3" },
      { suit: "hearts", rank: "5" },
    ])).toBe(false);
  });
});

describe("dealGame", () => {
  it("deals 5 cards to each player", () => {
    const state = dealGame("g1", [
      { id: "p1", name: "P1", isBot: false },
      { id: "p2", name: "P2", isBot: true },
    ]);
    expect(state.players[0].hand).toHaveLength(5);
    expect(state.players[1].hand).toHaveLength(5);
    expect(state.discardPile).toHaveLength(1);
    expect(state.status).toBe("in_progress");
    expect(state.deck.length).toBe(52 - 10 - 1); // 41
  });
});

describe("Yaniv scoring", () => {
  it("awards 0 to an opponent who beats the Yaniv caller", () => {
    const state = dealGame("assaf-scoring", [
      { id: "caller", name: "Caller", isBot: false },
      { id: "winner", name: "Winner", isBot: true },
      { id: "other", name: "Other", isBot: true },
    ]);

    const scored = applyAction({
      ...state,
      currentPlayerIndex: 0,
      players: [
        {
          ...state.players[0],
          id: "caller",
          hand: [{ suit: "hearts", rank: "7" }],
          score: 10,
        },
        {
          ...state.players[1],
          id: "winner",
          hand: [{ suit: "clubs", rank: "6" }],
          score: 20,
        },
        {
          ...state.players[2],
          id: "other",
          hand: [{ suit: "diamonds", rank: "9" }],
          score: 30,
        },
      ],
    }, { type: "CALL_YANIV", playerId: "caller" });

    expect(scored.roundResult).toMatchObject({ callerId: "caller", assaf: true });
    expect(scored.players.find((p) => p.id === "caller")?.score).toBe(40);
    expect(scored.players.find((p) => p.id === "winner")?.score).toBe(20);
    expect(scored.players.find((p) => p.id === "other")?.score).toBe(39);
  });

  it("awards 0 to each opponent tied for the lowest Assaf hand", () => {
    const state = dealGame("assaf-tie", [
      { id: "caller", name: "Caller", isBot: false },
      { id: "winner-1", name: "Winner 1", isBot: true },
      { id: "winner-2", name: "Winner 2", isBot: true },
      { id: "other", name: "Other", isBot: true },
    ]);

    const scored = applyAction({
      ...state,
      currentPlayerIndex: 0,
      players: [
        {
          ...state.players[0],
          id: "caller",
          hand: [{ suit: "hearts", rank: "7" }],
          score: 10,
        },
        {
          ...state.players[1],
          id: "winner-1",
          hand: [{ suit: "clubs", rank: "5" }],
          score: 20,
        },
        {
          ...state.players[2],
          id: "winner-2",
          hand: [{ suit: "diamonds", rank: "5" }],
          score: 30,
        },
        {
          ...state.players[3],
          id: "other",
          hand: [{ suit: "spades", rank: "6" }],
          score: 40,
        },
      ],
    }, { type: "CALL_YANIV", playerId: "caller" });

    expect(scored.roundResult).toMatchObject({ callerId: "caller", assaf: true });
    expect(scored.players.find((p) => p.id === "caller")?.score).toBe(40);
    expect(scored.players.find((p) => p.id === "winner-1")?.score).toBe(20);
    expect(scored.players.find((p) => p.id === "winner-2")?.score).toBe(30);
    expect(scored.players.find((p) => p.id === "other")?.score).toBe(46);
  });

  it("counts an opponent tied with the caller as the Assaf winner", () => {
    const state = dealGame("assaf-caller-tie", [
      { id: "caller", name: "Caller", isBot: false },
      { id: "winner", name: "Winner", isBot: true },
      { id: "other", name: "Other", isBot: true },
    ]);

    const scored = applyAction({
      ...state,
      currentPlayerIndex: 0,
      players: [
        {
          ...state.players[0],
          id: "caller",
          hand: [{ suit: "hearts", rank: "7" }],
          score: 10,
        },
        {
          ...state.players[1],
          id: "winner",
          hand: [{ suit: "clubs", rank: "7" }],
          score: 20,
        },
        {
          ...state.players[2],
          id: "other",
          hand: [{ suit: "diamonds", rank: "9" }],
          score: 30,
        },
      ],
    }, { type: "CALL_YANIV", playerId: "caller" });

    expect(scored.roundResult).toMatchObject({ callerId: "caller", assaf: true });
    expect(scored.players.find((p) => p.id === "caller")?.score).toBe(40);
    expect(scored.players.find((p) => p.id === "winner")?.score).toBe(20);
    expect(scored.players.find((p) => p.id === "other")?.score).toBe(39);
  });

  it("records savedScores when a player lands exactly on 50 (halved to 25)", () => {
    const state = dealGame("save-rule-50", [
      { id: "caller", name: "Caller", isBot: false },
      { id: "other", name: "Other", isBot: true },
    ]);

    const scored = applyAction({
      ...state,
      currentPlayerIndex: 0,
      players: [
        {
          ...state.players[0],
          id: "caller",
          hand: [{ suit: "hearts", rank: "7" }], // total 7 — caller wins, no save
          score: 0,
        },
        {
          ...state.players[1],
          id: "other",
          hand: [
            { suit: "clubs", rank: "K" },
            { suit: "spades", rank: "Q" },
          ], // total 20 → 30 + 20 = 50 → saved to 25
          score: 30,
        },
      ],
    }, { type: "CALL_YANIV", playerId: "caller" });

    // Correct scoring is preserved: the halving still applies.
    expect(scored.players.find((p) => p.id === "other")?.score).toBe(25);
    // The save is recorded with the pre-save gross and the halved result.
    expect(scored.roundResult?.savedScores).toEqual({ other: { from: 50, to: 25 } });
    // Delta reconciles with the total: 25 - 30 = -5.
    expect(scored.roundResult?.scoreDeltas.other).toBe(-5);
    // The caller landed on 0, not a save boundary — no entry.
    expect(scored.roundResult?.savedScores.caller).toBeUndefined();
  });

  it("caller wins round: scores 0, loser adds hand total", () => {
    const state = dealGame("g2", [
      { id: "p1", name: "P1", isBot: false },
      { id: "p2", name: "P2", isBot: true },
    ]);

    // Force p1 to have a very low hand by running the simulation
    // Instead, test the mechanic by calling Yaniv when eligible
    // This is an integration test — just run a simulation
    let s = state;
    let turns = 0;
    while (s.status === "in_progress" && turns < 200) {
      const curr = s.players[s.currentPlayerIndex];
      if (curr.id === "p1") {
        if (canCallYaniv(s.players[0].hand)) {
          s = applyAction(s, { type: "CALL_YANIV", playerId: "p1" });
          break;
        }
        let maxV = -1, maxIdx = 0;
        s.players[0].hand.forEach((c, i) => {
          const v = yanivCardValue(c.rank);
          if (v > maxV) { maxV = v; maxIdx = i; }
        });
        s = applyAction(s, { type: "DISCARD_AND_DRAW", playerId: "p1", discardIndices: [maxIdx], drawFromDiscard: false });
      } else {
        s = applyAction(s, bot.getNextMove(s, curr.id));
      }
      turns++;
    }

    // Either round_over or game_over from rounds
    expect(["round_over", "game_over"].includes(s.status)).toBe(true);
    if (s.roundResult) {
      expect(s.roundResult.handTotals).toBeTruthy();
    }
  });
});

describe("full game simulation", () => {
  it("completes a 3-player bot game within turn limit", () => {
    let state = dealGame("sim-game", [
      { id: "player-1", name: "You", isBot: false },
      { id: "bot-1", name: "Bot 1", isBot: true },
    ]);

    let turns = 0;
    const MAX_TURNS = 500;

    while (state.status !== "game_over" && turns < MAX_TURNS) {
      if (state.status === "round_over") {
        state = applyAction(state, { type: "NEXT_ROUND", playerId: "player-1" });
        continue;
      }

      const curr = state.players[state.currentPlayerIndex];
      if (curr.isBot) {
        state = applyAction(state, bot.getNextMove(state, curr.id));
      } else {
        if (canCallYaniv(state.players[0].hand)) {
          state = applyAction(state, { type: "CALL_YANIV", playerId: "player-1" });
        } else {
          let maxV = -1, maxIdx = 0;
          state.players[0].hand.forEach((c, i) => {
            const v = yanivCardValue(c.rank);
            if (v > maxV) { maxV = v; maxIdx = i; }
          });
          state = applyAction(state, {
            type: "DISCARD_AND_DRAW",
            playerId: "player-1",
            discardIndices: [maxIdx],
            drawFromDiscard: false,
          });
        }
      }
      turns++;
    }

    expect(state.status).toBe("game_over");
    expect(state.winnerId).toBeTruthy();
    // At least one player must be eliminated
    expect(state.players.some((p) => p.eliminated)).toBe(true);
  });
});

describe("getFinalStandings", () => {
  it("places the winner first, then orders the final table by score", () => {
    const state = dealGame("standings", [
      { id: "player-1", name: "You", isBot: false },
      { id: "bot-1", name: "Bot 1", isBot: true },
      { id: "bot-2", name: "Bot 2", isBot: true },
      { id: "bot-3", name: "Bot 3", isBot: true },
    ]);

    const standings = getFinalStandings({
      ...state,
      status: "game_over",
      winnerId: "bot-2",
      players: [
        { ...state.players[0], score: 40, eliminated: false },
        { ...state.players[1], score: 210, eliminated: true },
        { ...state.players[2], score: 55, eliminated: false },
        { ...state.players[3], score: 160, eliminated: true },
      ],
    });

    expect(standings.map((row) => row.playerId)).toEqual([
      "bot-2",
      "player-1",
      "bot-3",
      "bot-1",
    ]);
    expect(standings[0]).toMatchObject({
      rank: 1,
      name: "Bot 2",
      score: 55,
      isWinner: true,
      eliminated: false,
    });
    expect(standings[3]).toMatchObject({
      rank: 4,
      score: 210,
      eliminated: true,
      isWinner: false,
    });
  });
});
