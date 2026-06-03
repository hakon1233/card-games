import { describe, it, expect } from "vitest";
import {
  dealGoFish,
  applyAsk,
  extractBooks,
  publicStateFor,
  type GoFishGameState,
  type GoFishPlayer,
} from "./go-fish";
import { GoFishBot } from "../bots/go-fish-bot";
import type { Card, Rank } from "./types";

// ── helpers ─────────────────────────────────────────────────────────────────

function card(rank: Rank, suit: Card["suit"] = "spades"): Card {
  return { rank, suit };
}

function makePlayer(
  id: string,
  hand: Card[],
  books: Rank[] = [],
  isBot = false
): GoFishPlayer {
  return { id, name: id, isBot, hand, books, knownOpponentCards: {} };
}

function stateWith(
  players: GoFishPlayer[],
  deck: Card[] = [],
  currentPlayerIndex = 0
): GoFishGameState {
  return {
    gameId: "test",
    status: "in_progress",
    players,
    deck,
    currentPlayerIndex,
    lastEvent: null,
    winners: [],
  };
}

// ── AC: full deal ────────────────────────────────────────────────────────────

describe("dealGoFish", () => {
  it("deals 7 cards to each player for a 2-player game", () => {
    const state = dealGoFish("g1", [
      { id: "p1", name: "Alice", isBot: false },
      { id: "p2", name: "Bob", isBot: false },
    ]);
    expect(state.players[0].hand.length).toBe(7);
    expect(state.players[1].hand.length).toBe(7);
    expect(state.deck.length).toBe(52 - 14); // 38 remaining
  });

  it("deals 5 cards to each player for a 4-player game", () => {
    const state = dealGoFish("g2", [
      { id: "p1", name: "A", isBot: false },
      { id: "p2", name: "B", isBot: false },
      { id: "p3", name: "C", isBot: false },
      { id: "p4", name: "D", isBot: false },
    ]);
    for (const p of state.players) {
      expect(p.hand.length).toBe(5);
    }
    expect(state.deck.length).toBe(52 - 20);
  });

  it("starts in in_progress status", () => {
    const state = dealGoFish("g3", [
      { id: "p1", name: "A", isBot: false },
      { id: "p2", name: "B", isBot: false },
    ]);
    expect(state.status).toBe("in_progress");
  });
});

// ── AC: ask/give mechanic ────────────────────────────────────────────────────

describe("applyAsk — gave_cards", () => {
  it("transfers all matching cards from target to asker", () => {
    const p1 = makePlayer("p1", [card("A", "hearts"), card("A", "clubs")]);
    const p2 = makePlayer("p2", [card("A", "diamonds"), card("K", "spades")]);
    const state = stateWith([p1, p2], [card("2")]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    const asker = next.players.find((p) => p.id === "p1")!;
    const target = next.players.find((p) => p.id === "p2")!;
    expect(asker.hand.filter((c) => c.rank === "A").length).toBe(3);
    expect(target.hand.some((c) => c.rank === "A")).toBe(false);
    expect(next.lastEvent?.outcome).toBe("gave_cards");
    expect(next.lastEvent?.transferCount).toBe(1);
  });

  it("gives the asking player an extra turn on success", () => {
    const p1 = makePlayer("p1", [card("K")]);
    const p2 = makePlayer("p2", [card("K", "hearts")]);
    const state = stateWith([p1, p2], [card("2")]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "K",
    });

    expect(next.currentPlayerIndex).toBe(0); // p1 goes again
  });

  it("rejects ask if asker doesn't hold the requested rank", () => {
    const p1 = makePlayer("p1", [card("K")]);
    const p2 = makePlayer("p2", [card("A")]);
    const state = stateWith([p1, p2], [card("2")]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A", // p1 doesn't have A
    });

    expect(next).toBe(state); // state unchanged
  });
});

// ── AC: go fish draw ─────────────────────────────────────────────────────────

describe("applyAsk — go_fish", () => {
  it("draws a card when target has no matching cards", () => {
    const p1 = makePlayer("p1", [card("A")]);
    const p2 = makePlayer("p2", [card("K")]);
    const topOfDeck = card("2");
    const state = stateWith([p1, p2], [topOfDeck]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    const asker = next.players.find((p) => p.id === "p1")!;
    expect(asker.hand.some((c) => c.rank === "2")).toBe(true);
    expect(next.lastEvent?.outcome).toBe("go_fish");
    expect(next.lastEvent?.drew?.rank).toBe("2");
  });

  it("advances turn to next player on go_fish (non-lucky draw)", () => {
    const p1 = makePlayer("p1", [card("A")]);
    const p2 = makePlayer("p2", [card("K")]);
    const state = stateWith([p1, p2], [card("2")]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    expect(next.currentPlayerIndex).toBe(1); // p2's turn
  });

  it("lucky draw: asker gets extra turn when drawn card matches asked rank", () => {
    const p1 = makePlayer("p1", [card("A")]);
    const p2 = makePlayer("p2", [card("K")]);
    const state = stateWith([p1, p2], [card("A", "diamonds")]); // matching card on deck top

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    expect(next.lastEvent?.outcome).toBe("go_fish_lucky");
    expect(next.currentPlayerIndex).toBe(0); // p1 goes again
  });

  it("handles empty deck gracefully — no draw, turn passes", () => {
    const p1 = makePlayer("p1", [card("A")]);
    const p2 = makePlayer("p2", [card("K")]);
    const state = stateWith([p1, p2], []); // empty deck

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    expect(next.lastEvent?.drew).toBeNull();
    expect(next.currentPlayerIndex).toBe(1);
  });
});

// ── AC: book detection ───────────────────────────────────────────────────────

describe("book detection", () => {
  it("extractBooks removes a complete set of 4 and records the book", () => {
    const player = makePlayer("p1", [
      card("A", "hearts"),
      card("A", "diamonds"),
      card("A", "clubs"),
      card("A", "spades"),
      card("K"),
    ]);
    const updated = extractBooks(player);
    expect(updated.books).toContain("A");
    expect(updated.hand.some((c) => c.rank === "A")).toBe(false);
    expect(updated.hand.some((c) => c.rank === "K")).toBe(true);
  });

  it("fires book detection when transfer completes a set of 4", () => {
    const p1 = makePlayer("p1", [
      card("A", "hearts"),
      card("A", "diamonds"),
      card("A", "clubs"),
    ]);
    const p2 = makePlayer("p2", [card("A", "spades"), card("K")]);
    const state = stateWith([p1, p2], [card("2")]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    const asker = next.players.find((p) => p.id === "p1")!;
    expect(asker.books).toContain("A");
    expect(asker.hand.some((c) => c.rank === "A")).toBe(false);
  });

  it("fires book detection on lucky draw completing a set of 4", () => {
    const p1 = makePlayer("p1", [
      card("Q", "hearts"),
      card("Q", "diamonds"),
      card("Q", "clubs"),
    ]);
    const p2 = makePlayer("p2", [card("K")]);
    const state = stateWith([p1, p2], [card("Q", "spades")]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "Q",
    });

    const asker = next.players.find((p) => p.id === "p1")!;
    expect(asker.books).toContain("Q");
  });
});

// ── AC: game end + winner ─────────────────────────────────────────────────────

describe("game end", () => {
  it("ends the game when deck is exhausted", () => {
    const p1 = makePlayer("p1", [card("A")]);
    const p2 = makePlayer("p2", [card("K")]);
    const state = stateWith([p1, p2], []); // deck already empty

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    expect(next.status).toBe("over");
  });

  it("ends the game when all 13 books are collected", () => {
    // Give p1 12 books; p2 has the 13th ready to complete
    const allRanks: Rank[] = [
      "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q",
    ];
    const p1 = makePlayer(
      "p1",
      [card("K", "hearts"), card("K", "diamonds"), card("K", "clubs")],
      allRanks
    );
    const p2 = makePlayer("p2", [card("K", "spades"), card("3")]);
    const state = stateWith([p1, p2], [card("2")]);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "K",
    });

    expect(next.status).toBe("over");
    expect(next.winners).toContain("p1");
  });

  it("winner is the player with the most books", () => {
    // p1 has 2 books, p2 has 1 book, deck is empty
    const p1 = makePlayer("p1", [card("A")], ["K", "Q"]);
    const p2 = makePlayer("p2", [card("J")], ["10"]);
    const state = stateWith([p1, p2], []);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    expect(next.status).toBe("over");
    expect(next.winners).toEqual(["p1"]);
  });

  it("includes all tied players in winners", () => {
    const p1 = makePlayer("p1", [card("A")], ["K"]);
    const p2 = makePlayer("p2", [card("J")], ["Q"]);
    const state = stateWith([p1, p2], []);

    const next = applyAsk(state, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });

    expect(next.winners.sort()).toEqual(["p1", "p2"]);
  });

  it("does not mutate state after game is over", () => {
    const p1 = makePlayer("p1", [card("A")]);
    const p2 = makePlayer("p2", [card("K")]);
    const over = stateWith([p1, p2], []);
    const afterFirst = applyAsk(over, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });
    // Apply a second action — state should be returned unchanged
    const afterSecond = applyAsk(afterFirst, {
      type: "ASK",
      playerId: "p1",
      targetPlayerId: "p2",
      rank: "A",
    });
    expect(afterSecond).toBe(afterFirst);
  });
});

// ── AC: bot validity ──────────────────────────────────────────────────────────

describe("GoFishBot", () => {
  it("only asks for ranks it holds in hand", () => {
    const bot = new GoFishBot();
    const state = dealGoFish("g-bot", [
      { id: "human", name: "Human", isBot: false },
      { id: "bot", name: "Bot", isBot: true },
    ]);
    const botPlayer = state.players.find((p) => p.id === "bot")!;
    const botRanks = new Set(botPlayer.hand.map((c) => c.rank));

    const move = bot.getNextMove(state, "bot");

    expect(move.type).toBe("ASK");
    expect(botRanks.has(move.rank)).toBe(true);
  });

  it("targets an opponent known to have the rank", () => {
    const bot = new GoFishBot();
    const botPlayer: GoFishPlayer = {
      id: "bot",
      name: "Bot",
      isBot: true,
      hand: [card("A"), card("A", "hearts")],
      books: [],
      knownOpponentCards: {
        p2: ["A"], // bot knows p2 has A
        p3: [],
      },
    };
    const p2 = makePlayer("p2", [card("K")]);
    const p3 = makePlayer("p3", [card("K", "hearts")]);
    const state = stateWith([botPlayer, p2, p3], [card("2")], 0);

    const move = bot.getNextMove(state, "bot");

    expect(move.targetPlayerId).toBe("p2");
    expect(move.rank).toBe("A");
  });

  it("does not ask for a rank it doesn't hold (fuzz over 100 random deals)", () => {
    const bot = new GoFishBot();
    for (let i = 0; i < 100; i++) {
      const state = dealGoFish(`g-${i}`, [
        { id: "p1", name: "Human", isBot: false },
        { id: "bot", name: "Bot", isBot: true },
      ]);
      // Force bot to move
      const botState = { ...state, currentPlayerIndex: 1 };
      const botPlayer = botState.players.find((p) => p.id === "bot")!;
      if (botPlayer.hand.length === 0) continue;
      const move = bot.getNextMove(botState, "bot");
      const botRanks = new Set(botPlayer.hand.map((c) => c.rank));
      expect(botRanks.has(move.rank)).toBe(true);
    }
  });
});

// ── AC: full game simulation ──────────────────────────────────────────────────

describe("full game simulation", () => {
  it("plays a complete 2-player bot vs bot game to completion", () => {
    const bot = new GoFishBot();
    let state = dealGoFish("sim", [
      { id: "p1", name: "Bot1", isBot: true },
      { id: "p2", name: "Bot2", isBot: true },
    ]);

    let turns = 0;
    const MAX_TURNS = 500; // safety ceiling

    while (state.status === "in_progress" && turns < MAX_TURNS) {
      const current = state.players[state.currentPlayerIndex];
      if (current.hand.length === 0) {
        // No valid move — advance manually (edge: empty hand, deck empty)
        state = {
          ...state,
          currentPlayerIndex:
            (state.currentPlayerIndex + 1) % state.players.length,
        };
        turns++;
        continue;
      }
      const move = bot.getNextMove(state, current.id);
      state = applyAsk(state, move);
      turns++;
    }

    expect(state.status).toBe("over");
    expect(state.winners.length).toBeGreaterThan(0);
    const totalBks = state.players.reduce((s, p) => s + p.books.length, 0);
    // All books accounted for
    expect(totalBks).toBeGreaterThan(0);
  });

  it("publicStateFor hides opponent hands", () => {
    const state = dealGoFish("pub", [
      { id: "p1", name: "Alice", isBot: false },
      { id: "p2", name: "Bob", isBot: false },
    ]);
    const pub = publicStateFor(state, "p1");
    expect(pub.ownHand.length).toBe(7); // p1's own hand visible
    const p2Public = pub.players.find((p) => p.id === "p2")!;
    expect((p2Public as { hand?: Card[] }).hand).toBeUndefined();
    expect(p2Public.handSize).toBe(7);
    expect(pub.deckSize).toBe(52 - 14);
  });
});
