import type * as Party from "partykit/server";
import { applyAction, startGame } from "@/lib/games/blackjack";
import type { ClientMessage, GameState, PublicGameState, ServerMessage } from "@/lib/games/types";

function toPublic(state: GameState): PublicGameState {
  const { deck: _deck, ...pub } = state;
  return pub;
}

export default class GameRoom implements Party.Server {
  state: GameState | null = null;

  constructor(readonly room: Party.Room) {}

  async onStart() {
    this.state = (await this.room.storage.get<GameState>("state")) ?? null;
  }

  onConnect(conn: Party.Connection) {
    if (this.state) {
      const msg: ServerMessage = { type: "STATE_UPDATE", state: toPublic(this.state) };
      conn.send(JSON.stringify(msg));
    }
  }

  async onMessage(message: string, sender: Party.Connection) {
    let parsed: ClientMessage;
    try {
      parsed = JSON.parse(message) as ClientMessage;
    } catch {
      return;
    }

    if (parsed.type === "JOIN") {
      if (!this.state) {
        this.state = startGame(this.room.id, parsed.playerId);
        await this.room.storage.put("state", this.state);
      }
      const joined: ServerMessage = { type: "PLAYER_JOINED", playerId: parsed.playerId };
      sender.send(JSON.stringify(joined));
      const update: ServerMessage = { type: "STATE_UPDATE", state: toPublic(this.state) };
      this.room.broadcast(JSON.stringify(update));
      return;
    }

    if (parsed.type === "ACTION" && this.state) {
      this.state = applyAction(this.state, parsed.payload);
      await this.room.storage.put("state", this.state);
      const update: ServerMessage = { type: "STATE_UPDATE", state: toPublic(this.state) };
      this.room.broadcast(JSON.stringify(update));

      if (this.state.turn === "over") {
        const over: ServerMessage = { type: "GAME_OVER", result: this.state.status };
        this.room.broadcast(JSON.stringify(over));
      }
    }
  }

  /** Called from Next.js API route to reset or inject a specific game state */
  async onRequest(req: Party.Request): Promise<Response> {
    if (req.method === "POST") {
      const body: { state: GameState } = await req.json();
      this.state = body.state;
      await this.room.storage.put("state", this.state);
      const msg: ServerMessage = { type: "STATE_UPDATE", state: toPublic(this.state) };
      this.room.broadcast(JSON.stringify(msg));
      return new Response("ok");
    }
    return new Response("method not allowed", { status: 405 });
  }
}

GameRoom satisfies Party.Worker;
