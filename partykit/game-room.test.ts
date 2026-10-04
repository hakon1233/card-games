import { afterEach, describe, it, expect, vi } from "vitest";
import type * as Party from "partykit/server";
import GameRoom from "./game-room";
import { signRoomToken, type RoomGameType } from "@/lib/room-token";
import type { GoFishGameState, GoFishPlayer } from "@/lib/games/go-fish";
import type { Card } from "@/lib/games/types";

const SECRET = "a-room-token-secret-of-32-chars!!";
const ROOM = "ROOM01";

// A local stand-in for the PartyKit runtime: in-memory storage and connections
// that record what the room sends them.
class FakeConnection {
  state: unknown = null;
  sent: Array<Record<string, unknown>> = [];
  constructor(readonly id: string) {}
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  setState(state: unknown) {
    this.state = state;
    return state;
  }
  last() {
    return this.sent[this.sent.length - 1];
  }
}

function makeRoom(gameType: RoomGameType, hostId = "alice") {
  const store = new Map<string, unknown>();
  const connections: FakeConnection[] = [];
  const room = {
    id: ROOM,
    env: { ROOM_TOKEN_SECRET: SECRET },
    storage: {
      get: async (key: string) => store.get(key),
      put: async (key: string, value: unknown) => {
        store.set(key, structuredClone(value));
      },
    },
    getConnections: () => connections,
  };
  const server = new GameRoom(room as unknown as Party.Room);

  const send = async (conn: FakeConnection, msg: unknown) => {
    await server.onMessage(JSON.stringify(msg), conn as unknown as Parameters<GameRoom["onMessage"]>[1]);
  };

  return {
    server,
    send,
    store,
    tokenFor(userId: string, opts: { room?: string; secret?: string } = {}) {
      return signRoomToken(
        { room: opts.room ?? ROOM, userId, displayName: userId.toUpperCase(), hostId, gameType },
        opts.secret ?? SECRET,
      );
    },
    async connect() {
      const conn = new FakeConnection(`c${connections.length}`);
      connections.push(conn);
      return conn;
    },
    async join(userId: string) {
      const conn = await this.connect();
      await send(conn, { type: "JOIN", token: await this.tokenFor(userId) });
      return conn;
    },
  };
}

async function startedGame(gameType: RoomGameType) {
  const r = makeRoom(gameType);
  const alice = await r.join("alice");
  const bob = await r.join("bob");
  await r.send(alice, { type: "START" });
  return { ...r, alice, bob };
}

type LobbyView = { hostId: string; players: Array<{ userId: string; displayName: string }> };

describe("joining a room", () => {
  it("the host's token opens the lobby with the signed game and host", async () => {
    const r = makeRoom("go_fish");
    const alice = await r.join("alice");

    expect(alice.last().type).toBe("LOBBY_STATE");
    const lobby = alice.last().state as LobbyView & { gameType: string };
    expect(lobby.hostId).toBe("alice");
    expect(lobby.gameType).toBe("go_fish");
    expect(lobby.players.map((p) => [p.userId, p.displayName])).toEqual([["alice", "ALICE"]]);
  });

  it("a socket cannot join by claiming someone else's user id", async () => {
    const r = makeRoom("crazy_eights");
    const alice = await r.join("alice");
    const mallory = await r.connect();
    await r.send(mallory, { type: "JOIN", userId: "alice", displayName: "Alice" });

    expect(mallory.last()).toEqual({ type: "ERROR", message: "Invalid room token" });
    await r.send(mallory, { type: "START" });
    expect((alice.last().state as LobbyView).players).toHaveLength(1);
  });

  it("rejects a token signed with another secret or for another room", async () => {
    const r = makeRoom("crazy_eights");
    await r.join("alice");
    for (const token of [
      await r.tokenFor("bob", { secret: "another-secret-also-32-chars-long" }),
      await r.tokenFor("bob", { room: "OTHER1" }),
    ]) {
      const conn = await r.connect();
      await r.send(conn, { type: "JOIN", token });
      expect(conn.last()).toEqual({ type: "ERROR", message: "Invalid room token" });
    }
  });

  it("sends nothing to a socket that has not joined, through lobby and game", async () => {
    const r = makeRoom("crazy_eights");
    const lurker = await r.connect();
    const forger = await r.connect();
    await r.send(forger, { type: "JOIN", token: await r.tokenFor("eve", { secret: "a-third-secret-that-is-32-chars!!" }) });
    const alice = await r.join("alice");
    await r.join("bob");
    await r.send(alice, { type: "START" });

    expect(lurker.sent).toEqual([]);
    expect(forger.sent).toEqual([{ type: "ERROR", message: "Invalid room token" }]);
  });

  it("cannot be created or reset over HTTP", async () => {
    const r = makeRoom("crazy_eights");
    const alice = await r.join("alice");
    const res = await r.server.onRequest();

    expect(res.status).toBe(405);
    const bob = await r.join("bob");
    expect((bob.last().state as LobbyView).hostId).toBe("alice");
    expect(alice.last().type).toBe("LOBBY_STATE");
  });

  it("deals only the players still connected when the host starts", async () => {
    const r = makeRoom("go_fish");
    const alice = await r.join("alice");
    const bob = await r.join("bob");
    const carol = await r.join("carol");
    await r.server.onClose(carol as unknown as Parameters<GameRoom["onClose"]>[0]);
    await r.send(alice, { type: "START" });

    for (const conn of [alice, bob]) {
      const state = conn.last().state as { players: Array<{ id: string; handSize: number }>; deckSize: number };
      expect(state.players.map((p) => [p.id, p.handSize])).toEqual([["alice", 7], ["bob", 7]]);
      expect(state.deckSize).toBe(52 - 2 * 7);
    }
    const back = await r.join("carol");
    expect(back.last()).toEqual({ type: "ERROR", message: "Game already in progress" });
  });

  it("only the host can start the game", async () => {
    const r = makeRoom("go_fish");
    await r.join("alice");
    const bob = await r.join("bob");
    await r.send(bob, { type: "START" });

    expect(bob.last()).toEqual({ type: "ERROR", message: "Only the host can start the game" });
  });
});

describe("untrusted messages", () => {
  it("ignores malformed messages without failing or changing the game", async () => {
    const { alice, send } = await startedGame("crazy_eights");
    const before = alice.last();
    for (const junk of [
      { type: "CE_ACTION" },
      { type: "CE_ACTION", payload: null },
      { type: "CE_ACTION", payload: { type: "PLAY_CARD", playerId: "alice", cardIndex: "0" } },
      { type: "CE_ACTION", payload: { type: "PLAY_CARD", playerId: "alice", cardIndex: 0, declaredSuit: "stars" } },
      { type: "GF_ACTION", payload: { type: "ASK", playerId: "alice", targetPlayerId: "bob", rank: "Z" } },
      { type: "NOPE" },
      "not an object",
    ]) {
      await send(alice, junk);
    }

    expect(alice.last()).toBe(before);
  });
});

describe("oversized messages", () => {
  it("drops a message over 4 KB, even a well-formed one", async () => {
    const r = makeRoom("go_fish");
    const conn = await r.connect();
    await r.send(conn, { type: "JOIN", token: await r.tokenFor("alice"), padding: "x".repeat(4096) });

    expect(conn.sent).toEqual([]);
  });
});

describe("shuffling", () => {
  afterEach(() => vi.restoreAllMocks());

  it("deals every room game from the cryptographic source, never Math.random", async () => {
    for (const gameType of ["crazy_eights", "go_fish"] as const) {
      const mathRandom = vi.spyOn(Math, "random");
      const cryptoSource = vi.spyOn(crypto, "getRandomValues");
      await startedGame(gameType);
      expect(mathRandom).not.toHaveBeenCalled();
      expect(cryptoSource).toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });
});

describe("Crazy Eights room", () => {
  it("never sends a player an opponent's hand or the draw pile", async () => {
    const { alice, bob } = await startedGame("crazy_eights");

    for (const [conn, self] of [[alice, "alice"], [bob, "bob"]] as const) {
      const msg = conn.last();
      expect(msg.type).toBe("CE_STATE");
      const state = msg.state as Record<string, unknown>;
      expect(state).not.toHaveProperty("deck");
      expect(state.deckSize).toBe(52 - 2 * 7 - 1);
      expect(state.ownHand).toHaveLength(7);
      for (const p of state.players as Array<Record<string, unknown>>) {
        expect(p).not.toHaveProperty("hand");
        expect(p.handSize).toBe(7);
      }
      expect((state.players as Array<{ id: string }>).map((p) => p.id)).toContain(self);
    }
  });
});

describe("Go Fish room", () => {
  type View = {
    ownHand: Array<{ rank: string }>;
    lastEvent: { outcome: string; drew: unknown } | null;
  };

  it("shows the card drawn on 'Go Fish' only to the player who drew it", async () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const { alice, bob, send } = await startedGame("go_fish");
      const aliceHand = (alice.last().state as View).ownHand;
      const bobRanks = new Set((bob.last().state as View).ownHand.map((c) => c.rank));
      const rank = aliceHand.find((c) => !bobRanks.has(c.rank))?.rank;
      if (!rank) continue;

      await send(alice, {
        type: "GF_ACTION",
        payload: { type: "ASK", playerId: "alice", targetPlayerId: "bob", rank },
      });
      const aliceView = alice.last().state as View;
      const bobView = bob.last().state as View;
      if (aliceView.lastEvent?.outcome !== "go_fish") continue;

      expect(aliceView.lastEvent.drew).not.toBeNull();
      expect(bobView.lastEvent?.drew).toBeNull();
      return;
    }
    throw new Error("no plain 'Go Fish' outcome in 50 deals");
  });

  it("a player cannot act for another player", async () => {
    const { alice, bob, send } = await startedGame("go_fish");
    const before = alice.last();
    await send(bob, {
      type: "GF_ACTION",
      payload: { type: "ASK", playerId: "alice", targetPlayerId: "bob", rank: "A" },
    });

    expect(alice.last()).toBe(before);
  });

  it("an action the rules reject changes nothing and sends nothing", async () => {
    const { alice, bob, send } = await startedGame("go_fish");
    const sentBefore = [alice.sent.length, bob.sent.length];
    await send(bob, {
      type: "GF_ACTION",
      payload: { type: "ASK", playerId: "bob", targetPlayerId: "alice", rank: "A" },
    });

    expect([alice.sent.length, bob.sent.length]).toEqual(sentBefore);
  });

  it("passes the turn over a player whose hand is empty, so the game moves on", async () => {
    const card = (rank: Card["rank"], suit: Card["suit"] = "spades"): Card => ({ rank, suit });
    const seat = (id: string, hand: Card[]): GoFishPlayer => ({
      id, name: id.toUpperCase(), isBot: false, hand, books: [], knownOpponentCards: {},
    });
    const gameState: GoFishGameState = {
      gameId: ROOM,
      status: "in_progress",
      players: [seat("alice", [card("A")]), seat("bob", []), seat("carol", [card("K")])],
      deck: [card("2"), card("3")],
      currentPlayerIndex: 0,
      lastEvent: null,
      winners: [],
    };
    const r = makeRoom("go_fish");
    r.store.set("state", {
      phase: "go_fish",
      hostId: "alice",
      players: ["alice", "bob", "carol"].map((userId) => ({ userId, displayName: userId.toUpperCase(), connected: false })),
      gameState,
    });
    await r.server.onStart();
    const alice = await r.join("alice");
    await r.join("bob");
    const carol = await r.join("carol");

    await r.send(alice, {
      type: "GF_ACTION",
      payload: { type: "ASK", playerId: "alice", targetPlayerId: "carol", rank: "A" },
    });
    const sent = carol.sent.length;
    await r.send(carol, {
      type: "GF_ACTION",
      payload: { type: "ASK", playerId: "carol", targetPlayerId: "alice", rank: "K" },
    });

    expect(carol.sent.length).toBe(sent + 1);
    expect((carol.last().state as View).lastEvent?.outcome).toBe("go_fish");
  });
});
