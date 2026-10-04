import { describe, it, expect } from "vitest";
import type * as Party from "partykit/server";
import GameRoom from "./game-room";

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

function makeRoom(id = "ROOM01") {
  const store = new Map<string, unknown>();
  const connections: FakeConnection[] = [];
  const room = {
    id,
    env: {},
    storage: {
      get: async (key: string) => store.get(key),
      put: async (key: string, value: unknown) => {
        store.set(key, structuredClone(value));
      },
    },
    getConnections: () => connections,
  };
  const server = new GameRoom(room as unknown as Party.Room);

  return {
    server,
    async create(hostId: string, gameType: "crazy_eights" | "go_fish") {
      await server.onRequest(
        new Request("http://party/room", {
          method: "POST",
          body: JSON.stringify({ hostId, hostDisplayName: hostId, gameType }),
        }) as unknown as Party.Request,
      );
    },
    async connect() {
      const conn = new FakeConnection(`c${connections.length}`);
      connections.push(conn);
      await server.onConnect(conn as unknown as Party.Connection);
      return conn;
    },
    async send(conn: FakeConnection, msg: unknown) {
      await server.onMessage(JSON.stringify(msg), conn as unknown as Party.Connection);
    },
  };
}

async function startedGame(gameType: "crazy_eights" | "go_fish") {
  const r = makeRoom();
  await r.create("alice", gameType);
  const alice = await r.connect();
  const bob = await r.connect();
  await r.send(alice, { type: "JOIN", userId: "alice", displayName: "Alice" });
  await r.send(bob, { type: "JOIN", userId: "bob", displayName: "Bob" });
  await r.send(alice, { type: "START" });
  return { ...r, alice, bob };
}

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
