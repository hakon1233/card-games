import type { Card } from "@/lib/games/types";
import type { YanivGameState } from "@/lib/games/yaniv";
import { setYanivGame } from "@/lib/yaniv-store";

export const dynamic = "force-dynamic";

type Scenario = "save-50" | "save-100";

const PLAYER_ID = "player-1";
const BOT_ID = "bot-1";

function card(rank: Card["rank"], suit: Card["suit"] = "hearts"): Card {
  return { rank, suit };
}

function buildSaveScenario(scenario: Scenario): YanivGameState {
  const gameId = `qa-${scenario}-${crypto.randomUUID()}`;
  const botStartingScore = scenario === "save-50" ? 30 : 80;

  return {
    gameId,
    status: "in_progress",
    players: [
      {
        id: PLAYER_ID,
        name: "You",
        isBot: false,
        hand: [card("3"), card("4", "clubs")],
        score: 0,
        eliminated: false,
      },
      {
        id: BOT_ID,
        name: "Bot 1",
        isBot: true,
        hand: [card("10", "diamonds"), card("K", "spades")],
        score: botStartingScore,
        eliminated: false,
      },
    ],
    deck: [card("A", "spades"), card("2", "clubs"), card("5", "diamonds")],
    discardPile: [card("9", "clubs")],
    lastDiscardGroupCount: 1,
    currentPlayerIndex: 0,
    round: 1,
    roundResult: null,
    winnerId: null,
    settings: { yanivThreshold: 7, scoreLimit: 200, quickDraw: false },
    quickDrawWindow: null,
  };
}

export async function POST(request: Request) {
  if (process.env.YANIV_ENABLE_QA_FIXTURES !== "true") {
    return Response.json({ error: "Yaniv QA fixtures are disabled" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const scenario = body?.scenario;
  if (scenario !== "save-50" && scenario !== "save-100") {
    return Response.json({ error: "Unknown Yaniv QA fixture scenario" }, { status: 400 });
  }

  const state = buildSaveScenario(scenario);
  setYanivGame(state.gameId, state);

  return Response.json({ gameId: state.gameId, playerId: PLAYER_ID, scenario });
}
