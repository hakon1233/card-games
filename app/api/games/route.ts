import { createClient } from "@/lib/supabase/server";
import { dealInitialState } from "@/lib/games/blackjack";

export async function POST() {
  const supabase = await createClient();

  // Ensure the user is authenticated (sign in anonymously if needed)
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  let userId = user?.id;

  if (authError || !user) {
    const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError || !anonData.user) {
      return Response.json({ error: "Authentication failed" }, { status: 500 });
    }
    userId = anonData.user.id;
  }

  const gameId = crypto.randomUUID();
  const state = dealInitialState(gameId, userId!);

  const { error: insertError } = await supabase.from("games").insert({
    id: gameId,
    game_type: "blackjack",
    status: "in_progress",
    state,
    started_at: new Date().toISOString(),
  });

  if (insertError) {
    return Response.json({ error: "Failed to create game" }, { status: 500 });
  }

  // Record the human player seat
  await supabase.from("game_players").insert({
    game_id: gameId,
    user_id: userId,
    seat_index: 0,
    is_bot: false,
  });

  // Record bot seat
  await supabase.from("game_players").insert({
    game_id: gameId,
    user_id: null,
    seat_index: 1,
    is_bot: true,
  });

  return Response.json({ gameId });
}
