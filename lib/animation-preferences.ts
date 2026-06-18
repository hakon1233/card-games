export const ANIMATION_SPEED_STORAGE_KEY = "pip-animation-speed";

export const ANIMATION_SPEEDS = ["normal", "fast", "reduced"] as const;

export type AnimationSpeed = (typeof ANIMATION_SPEEDS)[number];

const LABELS: Record<AnimationSpeed, string> = {
  normal: "Normal",
  fast: "Fast",
  reduced: "Reduced",
};

const DURATION_SCALE: Record<AnimationSpeed, number> = {
  normal: 1,
  fast: 0.45,
  reduced: 0,
};

export function coerceAnimationSpeed(value: unknown): AnimationSpeed | null {
  return typeof value === "string" && ANIMATION_SPEEDS.includes(value as AnimationSpeed)
    ? (value as AnimationSpeed)
    : null;
}

export function animationSpeedLabel(speed: AnimationSpeed): string {
  return LABELS[speed];
}

export function getInitialAnimationSpeed({
  getStoredValue,
  prefersReducedMotion,
}: {
  getStoredValue: (key: string) => string | null;
  prefersReducedMotion: () => boolean;
}): AnimationSpeed {
  const stored = coerceAnimationSpeed(getStoredValue(ANIMATION_SPEED_STORAGE_KEY));
  if (stored) return stored;
  return prefersReducedMotion() ? "reduced" : "normal";
}

export function scaleAnimationDuration(ms: number, speed: AnimationSpeed): number {
  const scaled = ms * DURATION_SCALE[speed];
  return scaled === 0 ? 1 : Math.round(scaled);
}
