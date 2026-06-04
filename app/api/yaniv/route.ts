import { dealGame } from "@/lib/games/yaniv";
import { setYanivGame } from "@/lib/yaniv-store";

const PLAYER_ID = "player-1";
const BOT_ID = "bot-1";

export async function POST() {
  const gameId = crypto.randomUUID();
  const state = dealGame(gameId, [
    { id: PLAYER_ID, name: "You", isBot: false },
    { id: BOT_ID, name: "Bot", isBot: true },
  ]);

  setYanivGame(gameId, state);

  return Response.json({ gameId, playerId: PLAYER_ID });
}
