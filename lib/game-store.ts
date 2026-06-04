import type { BaseGameState } from "@/lib/games/types";

// In-memory store — no persistence between server restarts, fine for local testing
const games = new Map<string, BaseGameState>();

export function getGame(id: string): BaseGameState | undefined {
  return games.get(id);
}

export function setGame(id: string, state: BaseGameState): void {
  games.set(id, state);
}
