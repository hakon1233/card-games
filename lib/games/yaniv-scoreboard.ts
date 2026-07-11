import type { YanivGameState } from "./yaniv";

export type YanivScoreThresholdState = "safe" | "warning" | "busted";

export interface YanivScoreboardRow {
  id: string;
  name: string;
  handTotal: number;
  roundDelta: number;
  cumulativeScore: number;
  thresholdState: YanivScoreThresholdState;
  eliminated: boolean;
  /**
   * Present only when the 50/100 save rule fired for this player this round —
   * the score would have landed on `from` (50 or 100) and was halved to `to`
   * (25 or 50). The overlay renders it as a "Saved 50 → 25" chip so the
   * resulting round delta (which can be negative) does not read as a bug.
   */
  save: { from: number; to: number } | null;
}

function getThresholdState(score: number, scoreLimit: number, eliminated: boolean): YanivScoreThresholdState {
  if (eliminated || score > scoreLimit) return "busted";

  const warningWindow = Math.max(10, Math.ceil(scoreLimit * 0.1));
  return score >= scoreLimit - warningWindow ? "warning" : "safe";
}

export function getYanivScoreboardRows(state: YanivGameState): YanivScoreboardRow[] {
  const result = state.roundResult;
  if (!result) return [];

  return state.players.map((player) => ({
    id: player.id,
    name: player.name,
    handTotal: result.handTotals[player.id] ?? 0,
    // Source of truth: the engine records the exact change applied to each
    // cumulative score (Assaf penalty, Assaf-winner zeroing, and the 50/100
    // halving all included). Using it guarantees the animated delta reconciles
    // with the displayed total — `cumulativeScore === previousScore + roundDelta`.
    roundDelta: result.scoreDeltas[player.id] ?? 0,
    cumulativeScore: player.score,
    thresholdState: getThresholdState(player.score, state.settings.scoreLimit, player.eliminated),
    eliminated: player.eliminated,
    // Explains a save-rule round: engine records from/to only when the 50/100
    // halving fired, so a bare `?? null` cleanly distinguishes "saved" from
    // "genuinely landed here" (a plain total of 25 is not a save).
    save: result.savedScores?.[player.id] ?? null,
  }));
}
