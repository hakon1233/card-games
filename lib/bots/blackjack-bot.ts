import { handValue, cardValue } from "@/lib/games/blackjack";
import type { Card, GameAction, GameState } from "@/lib/games/types";

export interface BotPlayer {
  getNextMove(state: GameState, hand: Card[]): GameAction;
}

/**
 * Basic strategy table: hit when hand total < threshold based on dealer upcard.
 * Simplified for v1 — hard totals only (no split/double in v1).
 */
function shouldHit(playerTotal: number, dealerUpcard: number): boolean {
  // Always stand on 17+
  if (playerTotal >= 17) return false;
  // Always hit on 8 or less
  if (playerTotal <= 8) return true;

  // Dealer shows 2-6 (weak): stand on 12-16 to avoid dealer bust gift
  if (dealerUpcard >= 2 && dealerUpcard <= 6) {
    return playerTotal < 12;
  }
  // Dealer shows 7-A (strong): hit until 17
  return playerTotal < 17;
}

export class BlackjackBot implements BotPlayer {
  getNextMove(state: GameState, hand: Card[]): GameAction {
    const playerTotal = handValue(hand);
    const dealerUpcard = state.dealerHand.find((c) => !c.hidden);
    const dealerValue = dealerUpcard ? cardValue(dealerUpcard.rank) : 10;

    const hit = shouldHit(playerTotal, dealerValue);
    return {
      type: hit ? "HIT" : "STAND",
      playerId: state.playerHand.playerId,
    };
  }
}
