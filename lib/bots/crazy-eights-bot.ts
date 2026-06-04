import type { Card, Suit } from "@/lib/games/types";
import type { CrazyEightsState, CrazyEightsAction } from "@/lib/games/crazy-eights";
import { isPlayable } from "@/lib/games/crazy-eights";
import type { BotPlayer } from "./types";

function mostCommonSuit(hand: Card[]): Suit {
  const counts: Record<Suit, number> = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
  for (const card of hand) {
    if (card.rank !== "8") counts[card.suit]++;
  }
  return (Object.entries(counts) as [Suit, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

export class CrazyEightsBot implements BotPlayer<CrazyEightsState, CrazyEightsAction> {
  getNextMove(state: CrazyEightsState, playerId: string): CrazyEightsAction {
    const playerIdx = state.players.findIndex((p) => p.id === playerId);
    const hand = state.players[playerIdx].hand;

    const playable = hand
      .map((card, index) => ({ card, index }))
      .filter(({ card }) => isPlayable(card, state));

    const nonEights = playable.filter(({ card }) => card.rank !== "8");
    if (nonEights.length > 0) {
      return { type: "PLAY_CARD", playerId, cardIndex: nonEights[0].index };
    }

    const eight = playable.find(({ card }) => card.rank === "8");
    if (eight) {
      const remaining = hand.filter((_, i) => i !== eight.index);
      const declaredSuit = remaining.length > 0 ? mostCommonSuit(remaining) : "hearts";
      return { type: "PLAY_CARD", playerId, cardIndex: eight.index, declaredSuit };
    }

    return { type: "DRAW_CARD", playerId };
  }
}
