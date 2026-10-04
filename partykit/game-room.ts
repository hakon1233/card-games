import type * as Party from "partykit/server";
import { cryptoRng } from "@/lib/games/engine";
import * as crazyEights from "@/lib/games/crazy-eights";
import type { CrazyEightsState, CrazyEightsAction, CrazyEightsPlayerView } from "@/lib/games/crazy-eights";
import * as goFish from "@/lib/games/go-fish";
import type { GoFishGameState, GoFishAskAction, GoFishPlayerView } from "@/lib/games/go-fish";
import { verifyRoomToken, type RoomGameType } from "@/lib/room-token";
import { RANKS, SUITS } from "@/lib/games/deck-utils";

type LobbyPlayer = {
  userId: string;
  displayName: string;
  connected: boolean;
};

export type LobbyState = {
  phase: "lobby";
  hostId: string;
  gameType: RoomGameType;
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

/** `token` is a signed room token (lib/room-token.ts) minted by the Next.js server. */
type JoinMsg = { type: "JOIN"; token: unknown };
type StartMsg = { type: "START" };
type CeActionMsg = { type: "CE_ACTION"; payload: CrazyEightsAction };
type GfActionMsg = { type: "GF_ACTION"; payload: GoFishAskAction };
type ClientMessage = JoinMsg | StartMsg | CeActionMsg | GfActionMsg;

type LobbyStateMsg = { type: "LOBBY_STATE"; state: LobbyState };
type CeStateMsg = {
  type: "CE_STATE";
  state: CrazyEightsPlayerView;
  myIndex: number;
};
type GfStateMsg = { type: "GF_STATE"; state: GoFishPlayerView };
type ErrorMsg = { type: "ERROR"; message: string };
/** Everything the room sends a joined client. */
export type ServerMessage = LobbyStateMsg | CeStateMsg | GfStateMsg | ErrorMsg;

type ConnState = { userId: string };

export default class GameRoom implements Party.Server {
  private state: RoomState | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    this.state = (await this.room.storage.get<RoomState>("state")) ?? null;
  }

  async onMessage(raw: string, sender: Party.Connection<ConnState>) {
    const msg = parseClientMessage(raw);
    if (!msg) return;

    switch (msg.type) {
      case "JOIN":
        await this.handleJoin(msg, sender);
        break;
      case "START":
        await this.handleStart(sender);
        break;
      case "CE_ACTION":
      case "GF_ACTION":
        await this.handleAction(msg, sender);
        break;
    }
  }

  async onClose(connection: Party.Connection<ConnState>) {
    if (!this.state) return;
    const cs = connection.state;
    if (!cs?.userId) return;

    const player = this.state.players.find((p) => p.userId === cs.userId);
    if (player) {
      player.connected = false;
      await this.persist();
      this.broadcastAll();
    }
  }

  /** Rooms are created by the host's first JOIN, never over HTTP. */
  async onRequest(): Promise<Response> {
    return new Response("Method not allowed", { status: 405 });
  }

  private async handleJoin(msg: JoinMsg, sender: Party.Connection<ConnState>) {
    const secret = this.room.env.ROOM_TOKEN_SECRET;
    const claims = await verifyRoomToken(
      msg.token,
      this.room.id,
      typeof secret === "string" ? secret : "",
    );
    if (!claims) {
      const err: ErrorMsg = { type: "ERROR", message: "Invalid room token" };
      sender.send(JSON.stringify(err));
      return;
    }
    const { userId, displayName } = claims;

    // The room row (host, game) lives in Supabase; the token carries it signed.
    this.state ??= { phase: "lobby", hostId: claims.hostId, gameType: claims.gameType, players: [] };

    const idx = this.state.players.findIndex((p) => p.userId === userId);
    if (idx >= 0) {
      this.state.players[idx].connected = true;
      this.state.players[idx].displayName = displayName;
    } else if (this.state.phase === "lobby" && this.state.players.length < 4) {
      this.state.players.push({ userId, displayName, connected: true });
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

    sender.setState({ userId } satisfies ConnState);
    await this.persist();
    this.broadcastAll();
  }

  private async handleStart(sender: Party.Connection<ConnState>) {
    if (!this.state || this.state.phase !== "lobby") return;

    const cs = sender.state;
    if (cs?.userId !== this.state.hostId) {
      const err: ErrorMsg = { type: "ERROR", message: "Only the host can start the game" };
      sender.send(JSON.stringify(err));
      return;
    }

    // Only players connected now are dealt in; anyone who left the lobby is dropped from the game.
    const players = this.state.players.filter((p) => p.connected);
    if (players.length < 2) {
      const err: ErrorMsg = { type: "ERROR", message: "Need at least 2 players to start" };
      sender.send(JSON.stringify(err));
      return;
    }

    const hostId = this.state.hostId;

    if (this.state.gameType === "crazy_eights") {
      const gameState = crazyEights.deal(
        this.room.id,
        players.map((p) => p.userId),
        players.map(() => false),
        cryptoRng,
      );
      this.state = { phase: "crazy_eights", hostId, players, gameState };
    } else {
      const gameState = goFish.deal(
        this.room.id,
        players.map((p) => ({ id: p.userId, name: p.displayName, isBot: false })),
        cryptoRng,
      );
      this.state = { phase: "go_fish", hostId, players, gameState };
    }

    await this.persist();
    this.broadcastAll();
  }

  /** A player's action in a running game; actions for someone else, or that the rules reject, change nothing. */
  private async handleAction(msg: CeActionMsg | GfActionMsg, sender: Party.Connection<ConnState>) {
    const room = this.state;
    if (!room || sender.state?.userId !== msg.payload.playerId) return;

    const before = room.phase === "lobby" ? null : room.gameState;
    if (msg.type === "CE_ACTION" && room.phase === "crazy_eights") {
      room.gameState = crazyEights.apply(room.gameState, msg.payload, cryptoRng);
    } else if (msg.type === "GF_ACTION" && room.phase === "go_fish") {
      room.gameState = goFish.apply(room.gameState, msg.payload);
    }
    if (room.phase === "lobby" || room.gameState === before) return;

    await this.persist();
    this.broadcastAll();
  }

  /** Only sockets that joined with a valid room token ever receive room state. */
  private broadcastAll() {
    for (const conn of this.room.getConnections<ConnState>()) {
      const userId = conn.state?.userId;
      if (userId) this.sendStateTo(conn, userId);
    }
  }

  private sendStateTo(conn: Party.Connection, userId: string) {
    if (!this.state) return;

    let msg: ServerMessage;

    if (this.state.phase === "lobby") {
      msg = { type: "LOBBY_STATE", state: this.state };
    } else if (this.state.phase === "crazy_eights") {
      msg = {
        type: "CE_STATE",
        state: crazyEights.playerView(this.state.gameState, userId),
        myIndex: this.state.players.findIndex((p) => p.userId === userId),
      };
    } else {
      msg = { type: "GF_STATE", state: goFish.playerView(this.state.gameState, userId) };
    }

    conn.send(JSON.stringify(msg));
  }

  private async persist() {
    await this.room.storage.put("state", this.state);
  }
}

GameRoom satisfies Party.Worker;

/** The longest client message the room reads; real ones (a room token, an action) are far smaller. */
const MAX_MESSAGE_LENGTH = 4096;

/** Clients are untrusted: anything oversized or not a well-formed message is dropped. */
function parseClientMessage(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_LENGTH) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;

  switch (value.type) {
    case "JOIN":
      return { type: "JOIN", token: value.token };
    case "START":
      return { type: "START" };
    case "CE_ACTION": {
      const p = value.payload;
      if (!isRecord(p) || typeof p.playerId !== "string") return null;
      if (p.type === "DRAW_CARD") {
        return { type: "CE_ACTION", payload: { type: "DRAW_CARD", playerId: p.playerId } };
      }
      const suit = SUITS.find((s) => s === p.declaredSuit);
      if (
        p.type !== "PLAY_CARD" ||
        !Number.isInteger(p.cardIndex) ||
        (p.declaredSuit !== undefined && !suit)
      ) {
        return null;
      }
      return {
        type: "CE_ACTION",
        payload: { type: "PLAY_CARD", playerId: p.playerId, cardIndex: Number(p.cardIndex), declaredSuit: suit },
      };
    }
    case "GF_ACTION": {
      const p = value.payload;
      const rank = isRecord(p) ? RANKS.find((r) => r === p.rank) : undefined;
      if (
        !isRecord(p) ||
        p.type !== "ASK" ||
        typeof p.playerId !== "string" ||
        typeof p.targetPlayerId !== "string" ||
        !rank
      ) {
        return null;
      }
      return {
        type: "GF_ACTION",
        payload: { type: "ASK", playerId: p.playerId, targetPlayerId: p.targetPlayerId, rank },
      };
    }
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
