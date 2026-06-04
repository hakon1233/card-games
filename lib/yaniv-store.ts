import type { YanivGameState } from "@/lib/games/yaniv";

const games = new Map<string, YanivGameState>();

export function getYanivGame(id: string): YanivGameState | undefined {
  return games.get(id);
}

export function setYanivGame(id: string, state: YanivGameState): void {
  games.set(id, state);
}
