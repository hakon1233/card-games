import { describe, expect, it } from "vitest";

import { getVirtualTableSeatPlacements } from "./shell";
import type { Seat } from "@/lib/games/shell-types";

function seat(id: string, isSelf = false): Seat {
  return {
    id,
    name: id,
    isBot: !isSelf,
    isSelf,
    isActive: false,
    hand: [],
    score: { label: "Score", value: 0 },
  };
}

describe("getVirtualTableSeatPlacements", () => {
  it("keeps the local player anchored bottom-center", () => {
    const placements = getVirtualTableSeatPlacements([seat("bot-1"), seat("you", true)]);

    expect(placements.find((p) => p.seat.id === "you")).toMatchObject({
      xPct: 50,
      yPct: 82,
      anchor: "self",
    });
  });

  it("spreads opponents across the far side as player count grows", () => {
    const placements = getVirtualTableSeatPlacements([
      seat("bot-1"),
      seat("bot-2"),
      seat("bot-3"),
      seat("bot-4"),
      seat("you", true),
    ]);
    const opponents = placements.filter((p) => !p.seat.isSelf);

    expect(opponents.map((p) => p.seat.id)).toEqual(["bot-1", "bot-2", "bot-3", "bot-4"]);
    expect(opponents.map((p) => p.yPct)).toEqual([31, 20, 20, 31]);
    expect(opponents[0].xPct).toBeLessThan(opponents[1].xPct);
    expect(opponents[1].xPct).toBeLessThan(opponents[2].xPct);
    expect(opponents[2].xPct).toBeLessThan(opponents[3].xPct);
  });
});
