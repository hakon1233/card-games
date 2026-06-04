import type { Card, Rank } from "@/lib/games/types";
import type { GoFishAskAction, GoFishGameState, GoFishPlayer } from "@/lib/games/go-fish";
import type { BotPlayer } from "./types";

export class GoFishBot implements BotPlayer<GoFishGameState, GoFishAskAction> {
  /**
   * Returns the next ASK action for the bot.
   * Strategy (medium difficulty):
   *  - Only asks for ranks it holds in hand.
   *  - Prefers ranks where it holds the most cards (closer to completing a book).
   *  - Targets opponents known to have the chosen rank first; falls back to random.
   */
  getNextMove(state: GoFishGameState, botPlayerId: string): GoFishAskAction {
    const bot = state.players.find((p) => p.id === botPlayerId)!;
    const opponents = state.players.filter((p) => p.id !== botPlayerId);

    const rankToAsk = pickRank(bot.hand);
    const target = pickTarget(opponents, rankToAsk, bot.knownOpponentCards);

    return {
      type: "ASK",
      playerId: botPlayerId,
      targetPlayerId: target.id,
      rank: rankToAsk,
    };
  }
}

function pickRank(hand: Card[]): Rank {
  const counts = new Map<Rank, number>();
  for (const card of hand) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  // Ask for the rank we hold the most of (best odds of completing a book)
  let bestRank = hand[0].rank;
  let bestCount = 0;
  for (const [rank, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      bestRank = rank;
    }
  }
  return bestRank;
}

function pickTarget(
  opponents: GoFishPlayer[],
  rank: Rank,
  known: Record<string, Rank[]>
): GoFishPlayer {
  // Prefer opponents we know have this rank
  const confirmedTargets = opponents.filter((p) =>
    (known[p.id] ?? []).includes(rank)
  );
  if (confirmedTargets.length > 0) return confirmedTargets[0];

  // Fall back to a random opponent with cards
  return opponents[Math.floor(Math.random() * opponents.length)];
}
