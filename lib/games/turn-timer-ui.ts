export type TurnTimerUrgency = "normal" | "warning" | "critical";

export function getTurnTimerUrgency(progress: number): TurnTimerUrgency {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0.25) return "critical";
  if (clamped <= 0.5) return "warning";
  return "normal";
}

export function shouldPlayLowTimeCue({
  previousMs,
  remainingMs,
  thresholdMs,
}: {
  previousMs: number | null;
  remainingMs: number;
  thresholdMs: number;
}): boolean {
  return previousMs !== null && previousMs > thresholdMs && remainingMs <= thresholdMs;
}
