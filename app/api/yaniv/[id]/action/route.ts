import { NextRequest } from "next/server";
import { applyAction, type YanivAction } from "@/lib/games/yaniv";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import { getYanivGame, setYanivGame } from "@/lib/yaniv-store";

const bot = new YanivBot();

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: gameId } = await params;

  let state = getYanivGame(gameId);
  if (!state) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  const action: YanivAction = await request.json();
  state = applyAction(state, action);

  // Run bot turns until it's the human player's turn or the game/round ends
  const humanId = state.players.find((p) => !p.isBot)?.id;
  while (
    state.status === "in_progress" &&
    humanId !== undefined &&
    state.players[state.currentPlayerIndex]?.isBot
  ) {
    const botId = state.players[state.currentPlayerIndex].id;
    const botAction = bot.getNextMove(state, botId);
    state = applyAction(state, botAction);
  }

  setYanivGame(gameId, state);

  return Response.json({ state });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: gameId } = await params;

  const state = getYanivGame(gameId);
  if (!state) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  return Response.json({ state });
}
