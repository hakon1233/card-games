export type YanivTableFormFactor = "portrait" | "standard" | "widescreen";

export interface YanivRingSeatLayout {
  id: string;
  xPct: number;
  yPct: number;
  angle: number;
}

export interface YanivRingLayout {
  centerXPct: number;
  centerYPct: number;
  xRadiusPct: number;
  yRadiusPct: number;
  seats: YanivRingSeatLayout[];
}

const RING_LAYOUTS: Record<
  YanivTableFormFactor,
  Pick<YanivRingLayout, "centerXPct" | "centerYPct" | "xRadiusPct" | "yRadiusPct">
> = {
  portrait: { centerXPct: 50, centerYPct: 50, xRadiusPct: 34, yRadiusPct: 38 },
  standard: { centerXPct: 50, centerYPct: 50, xRadiusPct: 38, yRadiusPct: 38 },
  widescreen: { centerXPct: 50, centerYPct: 50, xRadiusPct: 44, yRadiusPct: 32 },
};

export function getYanivRingLayout(
  playerIds: string[],
  humanId: string,
  formFactor: YanivTableFormFactor,
): YanivRingLayout {
  const N = playerIds.length;
  const humanIdx = Math.max(0, playerIds.findIndex((id) => id === humanId));
  const base = RING_LAYOUTS[formFactor];

  return {
    ...base,
    seats: playerIds.map((id, i) => {
      const offset = (i - humanIdx + N) % N;
      const angle = Math.PI / 2 + offset * ((2 * Math.PI) / N);
      return {
        id,
        angle,
        xPct: base.centerXPct + base.xRadiusPct * Math.cos(angle),
        yPct: base.centerYPct + base.yRadiusPct * Math.sin(angle),
      };
    }),
  };
}
