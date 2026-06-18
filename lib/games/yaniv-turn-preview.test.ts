import { describe, expect, it } from "vitest";
import { getTurnPreviewName } from "./yaniv-turn-preview";

const players = [
  { id: "player-1", name: "You", eliminated: false },
  { id: "bot-1", name: "Bot 1", eliminated: false },
  { id: "bot-2", name: "Bot 2", eliminated: true },
];

describe("getTurnPreviewName", () => {
  it("does not preview the initial active player", () => {
    expect(getTurnPreviewName(players, 0, null)).toBeNull();
  });

  it("returns the new active player's name after a turn handoff", () => {
    expect(getTurnPreviewName(players, 1, "player-1")).toBe("Bot 1");
  });

  it("does not preview unchanged, eliminated, or missing seats", () => {
    expect(getTurnPreviewName(players, 1, "bot-1")).toBeNull();
    expect(getTurnPreviewName(players, 2, "bot-1")).toBeNull();
    expect(getTurnPreviewName(players, 10, "bot-1")).toBeNull();
  });
});
