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
}

function getThresholdState(score: number, scoreLimit: number, eliminated: boolean): YanivScoreThresholdState {
  if (eliminated || score > scoreLimit) return "busted";

  const warningWindow = Math.max(10, Math.ceil(scoreLimit * 0.1));
  return score >= scoreLimit - warningWindow ? "warning" : "safe";
}

export function getYanivScoreboardRows(state: YanivGameState): YanivScoreboardRow[] {
  const result = state.roundResult;
  if (!result) return [];

  return state.players.map((player) => {
    // Raw points added this round (before halving). The caller scores 0 (or 30
    // for Assaf); everyone else scores their hand total.
    const rawDelta = player.eliminated
      ? 0
      : player.id === result.callerId
        ? result.assaf ? 30 : 0
        : (result.handTotals[player.id] ?? 0);

    return {
      id: player.id,
      name: player.name,
      handTotal: result.handTotals[player.id] ?? 0,
      roundDelta: rawDelta,
      cumulativeScore: player.score,
      thresholdState: getThresholdState(player.score, state.settings.scoreLimit, player.eliminated),
      eliminated: player.eliminated,
    };
  });
}
