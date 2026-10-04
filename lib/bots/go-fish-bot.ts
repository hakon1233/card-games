import type { Card, Rank } from "@/lib/games/types";
import type { GoFishAskAction, GoFishGameState, GoFishPlayer } from "@/lib/games/go-fish";
import type { Bot } from "@/lib/games/bot-turns";
import type { Rng } from "@/lib/games/engine";

export class GoFishBot implements Bot<GoFishGameState, GoFishAskAction> {
  private readonly rng: Rng;

  /**
   * @param rng Source of randomness in [0, 1) for picking an opponent when none is known to hold
   * the rank. Defaults to Math.random, read on every pick so a test that seeds Math.random seeds
   * the bot too; tests may pass `seededRng(n)` instead.
   */
  constructor(rng: Rng = () => Math.random()) {
    this.rng = rng;
  }

  /**
   * Returns the next ASK action for the bot, or null when its hand is empty and it has nothing
   * to ask with (the rules engine never makes such a player active).
   * Strategy (medium difficulty):
   *  - Only asks for ranks it holds in hand.
   *  - Prefers ranks where it holds the most cards (closer to completing a book).
   *  - Targets opponents known to have the chosen rank first; falls back to random.
   */
  getNextMove(state: GoFishGameState, botPlayerId: string): GoFishAskAction | null {
    const bot = state.players.find((p) => p.id === botPlayerId);
    const rankToAsk = bot && pickRank(bot.hand);
    if (!bot || !rankToAsk) return null;

    const opponents = state.players.filter((p) => p.id !== botPlayerId);
    const target = pickTarget(opponents, rankToAsk, bot.knownOpponentCards, this.rng);

    return {
      type: "ASK",
      playerId: botPlayerId,
      targetPlayerId: target.id,
      rank: rankToAsk,
    };
  }
}

/** The rank the hand holds the most of (best odds of completing a book); undefined for no cards. */
function pickRank(hand: Card[]): Rank | undefined {
  const counts = new Map<Rank, number>();
  for (const card of hand) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  let bestRank: Rank | undefined;
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
  known: Record<string, Rank[]>,
  rng: Rng,
): GoFishPlayer {
  // Prefer opponents we know have this rank
  const confirmedTargets = opponents.filter((p) =>
    (known[p.id] ?? []).includes(rank)
  );
  if (confirmedTargets.length > 0) return confirmedTargets[0];

  // Fall back to a random opponent
  return opponents[Math.floor(rng() * opponents.length)];
}
