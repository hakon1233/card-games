import { describe, expect, it } from "vitest";

import { getYanivHandReadout } from "./yaniv-readout";
import type { Card } from "./types";

const card = (rank: Card["rank"]): Card => ({ suit: "hearts", rank });

describe("getYanivHandReadout", () => {
  it("returns the hand total and distance above the Yaniv threshold", () => {
    expect(getYanivHandReadout([card("7"), card("3")], 7)).toEqual({
      total: 10,
      threshold: 7,
      distanceToThreshold: 3,
      withinThreshold: false,
    });
  });

  it("clamps the distance to zero when the hand can call Yaniv", () => {
    expect(getYanivHandReadout([card("A"), card("6")], 7)).toEqual({
      total: 7,
      threshold: 7,
      distanceToThreshold: 0,
      withinThreshold: true,
    });
  });
});
