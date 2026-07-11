import type { Card } from "@/lib/games/types";
import {
  type YanivGameState,
  type YanivAction,
  yanivCardValue,
  handTotal,
  canCallYaniv,
  isValidDiscard,
  discardPileTop,
} from "@/lib/games/yaniv";

/**
 * Hand total at or below which the bot always calls Yaniv the moment it can.
 * A hand this low is effectively unbeatable, so there is no reason to hold it —
 * and a bot that sat on a near-lock hand would look broken.
 */
const SNAP_CALL_MAX = 3;

/**
 * When the bot is eligible to call Yaniv but its hand is above SNAP_CALL_MAX, it
 * only calls this fraction of the time and otherwise keeps playing. This is the
 * GAM-154 pacing fix: the old bot called Yaniv the instant `canCallYaniv` was
 * true, so in a 1-bot game it won the race to call every round and a human never
 * got a realistic window to call Yaniv, trigger Assaf, or reach the save rule.
 * Holding eligible-but-not-locked hands keeps rounds alive long enough for the
 * human to act first sometimes, without making the bot a pushover.
 */
const CALL_PROBABILITY = 0.4;

export class YanivBot {
  private readonly rng: () => number;

  /**
   * @param rng Injectable source of randomness in [0, 1). Defaults to
   * `Math.random`; tests pass a deterministic function to force the call/hold
   * branch. Only the Yaniv-call decision is stochastic — move selection stays
   * deterministic.
   */
  constructor(rng: () => number = Math.random) {
    this.rng = rng;
  }

  /**
   * Decide whether the bot should steal during a quick-draw window.
   * Returns true when stealing the cards is likely to benefit the bot.
   */
  shouldQuickDraw(state: YanivGameState, botPlayerId: string): boolean {
    if (!state.quickDrawWindow) return false;
    const botIdx = state.players.findIndex((p) => p.id === botPlayerId);
    if (botIdx === -1 || state.players[botIdx].eliminated) return false;

    const stolenCards = state.quickDrawWindow.cards;
    const stolenTotal = stolenCards.reduce((s, c) => s + yanivCardValue(c.rank), 0);

    // Only steal low-value cards — gaining cards is bad unless they're nearly worthless
    if (stolenTotal > 5) return false;

    // Also check it doesn't push us over a sensible threshold
    const botHand = state.players[botIdx].hand;
    const currentTotal = handTotal(botHand);
    const newTotal = currentTotal + stolenTotal;

    // Steal if it keeps us comfortably under the Yaniv threshold (can still call next turn)
    const threshold = state.settings.yanivThreshold;
    return newTotal <= threshold + 4;
  }

  getNextMove(state: YanivGameState, botPlayerId: string): YanivAction {
    const playerIdx = state.players.findIndex((p) => p.id === botPlayerId);
    const hand = state.players[playerIdx].hand;

    if (
      canCallYaniv(hand, state.settings.yanivThreshold) &&
      this.shouldCallYaniv(hand)
    ) {
      return { type: "CALL_YANIV", playerId: botPlayerId };
    }

    const bestDiscard = pickBestDiscard(hand);
    const drawFromDiscard = shouldDrawFromDiscard(state, bestDiscard);

    return {
      type: "DISCARD_AND_DRAW",
      playerId: botPlayerId,
      discardIndices: bestDiscard,
      drawFromDiscard,
    };
  }

  /**
   * Given the bot is *eligible* to call Yaniv, decide whether it actually does.
   * Near-lock hands (<= SNAP_CALL_MAX) are always called; otherwise the bot
   * holds most of the time so a human gets a realistic window to call first.
   * See CALL_PROBABILITY for the full GAM-154 rationale.
   */
  private shouldCallYaniv(hand: Card[]): boolean {
    if (handTotal(hand) <= SNAP_CALL_MAX) return true;
    return this.rng() < CALL_PROBABILITY;
  }
}

function pickBestDiscard(hand: Card[]): number[] {
  // 1. Prefer valid combos that remove the most value
  const bestCombo = findHighestValueCombo(hand);
  if (bestCombo.length > 1) return bestCombo;

  // 2. Fall back to discarding the single highest-value card
  let maxValue = -1;
  let maxIdx = 0;
  for (let i = 0; i < hand.length; i++) {
    const v = yanivCardValue(hand[i].rank);
    if (v > maxValue) {
      maxValue = v;
      maxIdx = i;
    }
  }
  return [maxIdx];
}

function findHighestValueCombo(hand: Card[]): number[] {
  let bestIndices: number[] = [];
  let bestValue = 0;

  // Check pairs and sets (same rank)
  const byRank = new Map<string, number[]>();
  hand.forEach((c, i) => {
    const list = byRank.get(c.rank) ?? [];
    list.push(i);
    byRank.set(c.rank, list);
  });

  for (const indices of byRank.values()) {
    if (indices.length < 2) continue;
    const cards = indices.map((i) => hand[i]);
    if (!isValidDiscard(cards)) continue;
    const value = cards.reduce((s, c) => s + yanivCardValue(c.rank), 0);
    if (value > bestValue) {
      bestValue = value;
      bestIndices = indices;
    }
  }

  // Check straights (same suit, consecutive)
  const bySuit = new Map<string, { card: Card; idx: number }[]>();
  hand.forEach((c, i) => {
    const list = bySuit.get(c.suit) ?? [];
    list.push({ card: c, idx: i });
    bySuit.set(c.suit, list);
  });

  const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  for (const entries of bySuit.values()) {
    if (entries.length < 3) continue;
    const sorted = [...entries].sort(
      (a, b) => RANK_ORDER.indexOf(a.card.rank) - RANK_ORDER.indexOf(b.card.rank),
    );
    // Find longest consecutive run
    let runStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
      const consecutive =
        i < sorted.length &&
        RANK_ORDER.indexOf(sorted[i].card.rank) ===
          RANK_ORDER.indexOf(sorted[i - 1].card.rank) + 1;

      if (!consecutive) {
        const runLen = i - runStart;
        if (runLen >= 3) {
          const indices = sorted.slice(runStart, i).map((e) => e.idx);
          const value = indices.reduce((s, idx) => s + yanivCardValue(hand[idx].rank), 0);
          if (value > bestValue) {
            bestValue = value;
            bestIndices = indices;
          }
        }
        runStart = i;
      }
    }
  }

  return bestIndices;
}

function shouldDrawFromDiscard(state: YanivGameState, discardIndices: number[]): boolean {
  const top = discardPileTop(state);
  if (!top) return false;

  const topValue = yanivCardValue(top.rank);

  // Draw from pile only if the top card has lower value than average discarded card
  const discardedValue = discardIndices.reduce(
    (s, i) => s + yanivCardValue(state.players[state.currentPlayerIndex].hand[i].rank),
    0,
  ) / discardIndices.length;

  // Only take it if it's a low card (Ace, 2, or 3) AND lower than average discard
  return topValue <= 3 && topValue < discardedValue;
}
