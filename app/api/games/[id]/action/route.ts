import { NextRequest } from "next/server";
import { applyAction as applyBlackjackAction } from "@/lib/games/blackjack";
import {
  applyAction as applyCrazyEightsAction,
  type CrazyEightsAction,
  type CrazyEightsState,
} from "@/lib/games/crazy-eights";
import { applyAsk, type GoFishAction, type GoFishGameState } from "@/lib/games/go-fish";
import { getGame, setGame } from "@/lib/game-store";
import type { BaseGameState, GameAction, GameState, StoredGameType } from "@/lib/games/types";

function inferGameType(state: BaseGameState): StoredGameType {
  if (state.gameType) return state.gameType;
  if ("discardPile" in state) return "crazy_eights";
  if ("players" in state && "lastEvent" in state) return "go_fish";
  return "blackjack";
}

function isGameOver(state: BaseGameState, gameType: StoredGameType): boolean {
  if (gameType === "blackjack") return (state as GameState).turn === "over";
  return state.status === "over" || state.status === "round_over";
}

function applyStoredAction(
  state: BaseGameState,
  gameType: StoredGameType,
  action: unknown,
): BaseGameState {
  if (gameType === "go_fish") {
    return applyAsk(state as GoFishGameState, action as GoFishAction);
  }

  if (gameType === "crazy_eights") {
    return applyCrazyEightsAction(state as CrazyEightsState, action as CrazyEightsAction);
  }

  return applyBlackjackAction(state as GameState, action as GameAction);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;

  const currentState = getGame(gameId);
  if (!currentState) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  const gameType = inferGameType(currentState);
  if (isGameOver(currentState, gameType)) {
    return Response.json({ error: "Game is already over" }, { status: 400 });
  }

  const action = await request.json();
  const nextState = applyStoredAction(currentState, gameType, action);
  setGame(gameId, nextState);

  return Response.json({ state: nextState });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;

  const state = getGame(gameId);
  if (!state) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  return Response.json({ state });
}
