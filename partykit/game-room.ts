import type * as Party from "partykit/server";
import { dealGame, applyAction as ceApply } from "@/lib/games/crazy-eights";
import type { CrazyEightsState, CrazyEightsAction } from "@/lib/games/crazy-eights";
import { dealGoFish, applyAsk, publicStateFor } from "@/lib/games/go-fish";
import type { GoFishGameState, GoFishAskAction } from "@/lib/games/go-fish";

// ─── Lobby player entry ───────────────────────────────────────────────────────

type LobbyPlayer = {
  userId: string;
  displayName: string;
  connected: boolean;
};

// ─── Persisted room state ─────────────────────────────────────────────────────

type LobbyState = {
  phase: "lobby";
  hostId: string;
  gameType: "crazy_eights" | "go_fish";
  players: LobbyPlayer[];
};

type CrazyEightsRoomState = {
  phase: "crazy_eights";
  hostId: string;
  players: LobbyPlayer[];
  gameState: CrazyEightsState;
};

type GoFishRoomState = {
  phase: "go_fish";
  hostId: string;
  players: LobbyPlayer[];
  gameState: GoFishGameState;
};

type RoomState = LobbyState | CrazyEightsRoomState | GoFishRoomState;

// ─── Client → Server messages ─────────────────────────────────────────────────

type JoinMsg = { type: "JOIN"; userId: string; displayName: string };
type StartMsg = { type: "START" };
type CeActionMsg = { type: "CE_ACTION"; payload: CrazyEightsAction };
type GfActionMsg = { type: "GF_ACTION"; payload: GoFishAskAction };
type ClientMessage = JoinMsg | StartMsg | CeActionMsg | GfActionMsg;

// ─── Server → Client messages ─────────────────────────────────────────────────

type LobbyStateMsg = { type: "LOBBY_STATE"; state: LobbyState };
type CeStateMsg = { type: "CE_STATE"; state: CrazyEightsState; myIndex: number };
type GfStateMsg = { type: "GF_STATE"; state: ReturnType<typeof publicStateFor> };
type ErrorMsg = { type: "ERROR"; message: string };
type ServerMessage = LobbyStateMsg | CeStateMsg | GfStateMsg | ErrorMsg;

// ─── Per-connection state ─────────────────────────────────────────────────────

type ConnState = { userId: string };

export default class GameRoom implements Party.Server {
  private state: RoomState | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    this.state = (await this.room.storage.get<RoomState>("state")) ?? null;
  }

  async onConnect(connection: Party.Connection) {
    if (!this.state) return;
    // New connections receive current state immediately (full lobby state or personalized game state)
    this.sendStateTo(connection, null);
  }

  async onMessage(raw: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "JOIN":
        await this.handleJoin(msg, sender);
        break;
      case "START":
        await this.handleStart(sender);
        break;
      case "CE_ACTION":
        await this.handleCeAction(msg.payload, sender);
        break;
      case "GF_ACTION":
        await this.handleGfAction(msg.payload, sender);
        break;
    }
  }

  async onClose(connection: Party.Connection) {
    if (!this.state) return;
    const cs = connection.state as ConnState | null;
    if (!cs?.userId) return;

    const player = this.state.players.find((p) => p.userId === cs.userId);
    if (player) {
      player.connected = false;
      await this.persist();
      this.broadcastAll();
    }
  }

  /** Called by the Next.js API route when creating a room */
  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method === "POST") {
      const body = (await req.json()) as {
        hostId: string;
        hostDisplayName: string;
        gameType: "crazy_eights" | "go_fish";
      };
      this.state = {
        phase: "lobby",
        hostId: body.hostId,
        gameType: body.gameType,
        players: [{ userId: body.hostId, displayName: body.hostDisplayName, connected: false }],
      };
      await this.persist();
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (req.method === "GET") {
      if (!this.state) {
        return new Response(JSON.stringify(null), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Return public-safe lobby info
      const safe = {
        phase: this.state.phase,
        hostId: this.state.hostId,
        gameType: this.state.phase === "lobby" ? this.state.gameType : this.state.phase,
        playerCount: this.state.players.length,
        players: this.state.players.map((p) => ({
          userId: p.userId,
          displayName: p.displayName,
          connected: p.connected,
        })),
      };
      return new Response(JSON.stringify(safe), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  }

  // ─── Handlers ───────────────────────────────────────────────────────────────

  private async handleJoin(msg: JoinMsg, sender: Party.Connection) {
    if (!this.state) return;

    const idx = this.state.players.findIndex((p) => p.userId === msg.userId);
    if (idx >= 0) {
      this.state.players[idx].connected = true;
      this.state.players[idx].displayName = msg.displayName;
    } else if (this.state.phase === "lobby" && this.state.players.length < 4) {
      this.state.players.push({ userId: msg.userId, displayName: msg.displayName, connected: true });
    } else if (this.state.phase !== "lobby") {
      // Game already started — reject if not an existing player
      const err: ErrorMsg = { type: "ERROR", message: "Game already in progress" };
      sender.send(JSON.stringify(err));
      return;
    } else {
      const err: ErrorMsg = { type: "ERROR", message: "Room is full (max 4 players)" };
      sender.send(JSON.stringify(err));
      return;
    }

    sender.setState({ userId: msg.userId } satisfies ConnState);
    await this.persist();
    this.broadcastAll();
  }

  private async handleStart(sender: Party.Connection) {
    if (!this.state || this.state.phase !== "lobby") return;

    const cs = sender.state as ConnState | null;
    if (cs?.userId !== this.state.hostId) {
      const err: ErrorMsg = { type: "ERROR", message: "Only the host can start the game" };
      sender.send(JSON.stringify(err));
      return;
    }

    const connected = this.state.players.filter((p) => p.connected);
    if (connected.length < 2) {
      const err: ErrorMsg = { type: "ERROR", message: "Need at least 2 players to start" };
      sender.send(JSON.stringify(err));
      return;
    }

    const players = this.state.players;
    const hostId = this.state.hostId;

    if (this.state.gameType === "crazy_eights") {
      const gameState = dealGame(
        this.room.id,
        players.map((p) => p.userId),
        players.map(() => false),
      );
      this.state = { phase: "crazy_eights", hostId, players, gameState };
    } else {
      const gameState = dealGoFish(
        this.room.id,
        players.map((p) => ({ id: p.userId, name: p.displayName, isBot: false })),
      );
      this.state = { phase: "go_fish", hostId, players, gameState };
    }

    await this.persist();
    this.broadcastAll();
  }

  private async handleCeAction(payload: CrazyEightsAction, sender: Party.Connection) {
    if (!this.state || this.state.phase !== "crazy_eights") return;

    const cs = sender.state as ConnState | null;
    if (cs?.userId !== payload.playerId) return; // only act for yourself

    this.state.gameState = ceApply(this.state.gameState, payload);
    await this.persist();
    this.broadcastAll();
  }

  private async handleGfAction(payload: GoFishAskAction, sender: Party.Connection) {
    if (!this.state || this.state.phase !== "go_fish") return;

    const cs = sender.state as ConnState | null;
    if (cs?.userId !== payload.playerId) return;

    this.state.gameState = applyAsk(this.state.gameState, payload);
    await this.persist();
    this.broadcastAll();
  }

  // ─── Broadcast helpers ───────────────────────────────────────────────────────

  private broadcastAll() {
    for (const conn of this.room.getConnections<ConnState>()) {
      this.sendStateTo(conn, (conn.state as ConnState | null)?.userId ?? null);
    }
  }

  private sendStateTo(conn: Party.Connection, userId: string | null) {
    if (!this.state) return;

    let msg: ServerMessage;

    if (this.state.phase === "lobby") {
      msg = { type: "LOBBY_STATE", state: this.state };
    } else if (this.state.phase === "crazy_eights") {
      const myIndex = userId
        ? this.state.players.findIndex((p) => p.userId === userId)
        : -1;
      msg = { type: "CE_STATE", state: this.state.gameState, myIndex };
    } else {
      // go_fish — send personalised public state
      const pub = userId
        ? publicStateFor(this.state.gameState, userId)
        : publicStateFor(this.state.gameState, "");
      msg = { type: "GF_STATE", state: pub };
    }

    conn.send(JSON.stringify(msg));
  }

  private async persist() {
    await this.room.storage.put("state", this.state);
  }
}

GameRoom satisfies Party.Worker;
