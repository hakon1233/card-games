export type YanivFeedbackTone = "safe" | "score" | "penalty";
export type YanivFeedbackIntensity = "low" | "medium" | "strong";

export interface YanivScoreCascadePlayer {
  id: string;
  name: string;
  scoreBefore: number;
  scoreAfter: number;
  handTotal: number;
}

export interface YanivScoreCascadeInput {
  players: YanivScoreCascadePlayer[];
  callerId: string;
  assaf: boolean;
}

export interface YanivScoreCascadeEvent extends YanivScoreCascadePlayer {
  playerId: string;
  scoreDelta: number;
  delayMs: number;
  durationMs: number;
  tone: YanivFeedbackTone;
  intensity: YanivFeedbackIntensity;
  isCaller: boolean;
}

const BASE_STEP_MS = 240;
const DELTA_STEP_MS = 8;

export function buildYanivScoreCascade(input: YanivScoreCascadeInput): YanivScoreCascadeEvent[] {
  const ordered = [...input.players].sort((a, b) => {
    if (a.scoreAfter === a.scoreBefore && b.scoreAfter !== b.scoreBefore) return -1;
    if (b.scoreAfter === b.scoreBefore && a.scoreAfter !== a.scoreBefore) return 1;
    if (a.id === input.callerId) return -1;
    if (b.id === input.callerId) return 1;
    return Math.abs(b.scoreAfter - b.scoreBefore) - Math.abs(a.scoreAfter - a.scoreBefore);
  });

  let elapsedMs = 0;
  return ordered.map((player) => {
    const scoreDelta = player.scoreAfter - player.scoreBefore;
    const absDelta = Math.abs(scoreDelta);
    const durationMs = absDelta === 0 ? BASE_STEP_MS : BASE_STEP_MS + absDelta * DELTA_STEP_MS;
    const event: YanivScoreCascadeEvent = {
      ...player,
      playerId: player.id,
      scoreDelta,
      delayMs: elapsedMs,
      durationMs,
      tone: getTone({ scoreDelta, isCaller: player.id === input.callerId, assaf: input.assaf }),
      intensity: getIntensity(absDelta),
      isCaller: player.id === input.callerId,
    };
    elapsedMs += durationMs;
    return event;
  });
}

function getTone({
  scoreDelta,
  isCaller,
  assaf,
}: {
  scoreDelta: number;
  isCaller: boolean;
  assaf: boolean;
}): YanivFeedbackTone {
  if (scoreDelta === 0) return "safe";
  if (isCaller && assaf) return "penalty";
  return "score";
}

function getIntensity(absDelta: number): YanivFeedbackIntensity {
  if (absDelta >= 20) return "strong";
  if (absDelta >= 8) return "medium";
  return "low";
}
