import type { Card } from "./types";
import { handTotal } from "./yaniv";

export interface YanivHandReadout {
  total: number;
  threshold: number;
  distanceToThreshold: number;
  withinThreshold: boolean;
}

export function getYanivHandReadout(hand: Card[], threshold: number): YanivHandReadout {
  const total = handTotal(hand);
  const distanceToThreshold = Math.max(0, total - threshold);

  return {
    total,
    threshold,
    distanceToThreshold,
    withinThreshold: total <= threshold,
  };
}
