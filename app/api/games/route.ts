import { dealInitialState } from "@/lib/games/blackjack";
import { dealGame as dealCrazyEights } from "@/lib/games/crazy-eights";
import { dealGoFish } from "@/lib/games/go-fish";
import type { BaseGameState, StoredGameType } from "@/lib/games/types";
import { setGame } from "@/lib/game-store";

const GAME_TYPES = new Set<StoredGameType>(["blackjack", "go_fish", "crazy_eights"]);

function parseGameType(request: Request): StoredGameType | null {
  const gameType = new URL(request.url).searchParams.get("gameType") ?? "blackjack";
  return GAME_TYPES.has(gameType as StoredGameType) ? (gameType as StoredGameType) : null;
}

function dealState(gameType: StoredGameType, gameId: string, playerId: string): BaseGameState {
  if (gameType === "go_fish") {
    return {
      ...dealGoFish(gameId, [
        { id: playerId, name: "Player", isBot: false },
        { id: "bot-1", name: "Bot", isBot: true },
      ]),
      gameType,
    };
  }

  if (gameType === "crazy_eights") {
    return {
      ...dealCrazyEights(gameId, [playerId, "bot-1"], [false, true]),
      gameType,
    };
  }

  return { ...dealInitialState(gameId, playerId), gameType };
}

export async function POST(request: Request) {
  const gameType = parseGameType(request);
  if (!gameType) {
    return Response.json({ error: "Unsupported game type" }, { status: 400 });
  }

  const playerId = crypto.randomUUID();
  const gameId = crypto.randomUUID();
  const state = dealState(gameType, gameId, playerId);

  setGame(gameId, state);

  return Response.json({ gameId });
}
