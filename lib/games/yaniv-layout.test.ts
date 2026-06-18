import { describe, expect, it } from "vitest";

import { getYanivRingLayout } from "./yaniv-layout";

describe("getYanivRingLayout", () => {
  const players = ["player", "bot-1", "bot-2", "bot-3"];

  it("pins the human seat lower in portrait while keeping the ring compact", () => {
    const layout = getYanivRingLayout(players, "player", "portrait");
    const humanSeat = layout.seats.find((seat) => seat.id === "player");

    expect(humanSeat?.yPct).toBeGreaterThan(86);
    expect(layout.xRadiusPct).toBeLessThan(layout.yRadiusPct);
  });

  it("widens the ring on widescreen by repositioning seats horizontally", () => {
    const portrait = getYanivRingLayout(players, "player", "portrait");
    const widescreen = getYanivRingLayout(players, "player", "widescreen");

    expect(widescreen.xRadiusPct).toBeGreaterThan(portrait.xRadiusPct);
    expect(widescreen.yRadiusPct).toBeLessThanOrEqual(portrait.yRadiusPct);
    const widescreenBot = widescreen.seats.find((seat) => seat.id === "bot-1");
    const portraitBot = portrait.seats.find((seat) => seat.id === "bot-1");
    expect(widescreenBot).toBeDefined();
    expect(portraitBot).toBeDefined();
    expect(widescreenBot!.xPct).toBeLessThan(portraitBot!.xPct);
  });
});
