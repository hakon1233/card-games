import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyAction, dealInitialState } from "@/lib/games/blackjack";
import type { GameAction, GameState } from "@/lib/games/types";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "localhost:1999";

async function broadcastToPartykit(gameId: string, state: GameState) {
  const url = `http://${PARTYKIT_HOST}/parties/main/${gameId}`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  }).catch(() => {
    // Non-fatal — real-time update fails gracefully; client re-fetches via API
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const action: GameAction = await request.json();

  // Load current game state
  const { data: game, error: fetchError } = await supabase
    .from("games")
    .select("state, status")
    .eq("id", gameId)
    .single();

  if (fetchError || !game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  if (game.status === "over") {
    return Response.json({ error: "Game is already over" }, { status: 400 });
  }

  const currentState = game.state as GameState;

  if (currentState.turn === "over") {
    return Response.json({ error: "No moves remaining" }, { status: 400 });
  }

  const nextState = applyAction(currentState, action);
  const isOver = nextState.turn === "over";

  // Persist updated state
  const { error: updateError } = await supabase
    .from("games")
    .update({
      state: nextState,
      status: isOver ? "over" : "in_progress",
      ended_at: isOver ? new Date().toISOString() : null,
    })
    .eq("id", gameId);

  if (updateError) {
    return Response.json({ error: "Failed to update game" }, { status: 500 });
  }

  // Log the move
  await supabase.from("game_moves").insert({
    game_id: gameId,
    player_id: user.id,
    move_type: action.type,
    payload: action,
  });

  // Broadcast to Partykit (non-blocking)
  await broadcastToPartykit(gameId, nextState);

  return Response.json({ state: nextState });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params;
  const supabase = await createClient();

  const { data: game, error } = await supabase
    .from("games")
    .select("state, status")
    .eq("id", gameId)
    .single();

  if (error || !game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  return Response.json({ state: game.state });
}
