import { describe, expect, it } from "vitest";
import { buildYanivScoreCascade } from "./yaniv-feedback";

describe("buildYanivScoreCascade", () => {
  it("plans score count-up events in ascending delay with stronger feedback for larger deltas", () => {
    const events = buildYanivScoreCascade({
      players: [
        { id: "caller", name: "Caller", scoreBefore: 10, scoreAfter: 40, handTotal: 7 },
        { id: "winner", name: "Winner", scoreBefore: 20, scoreAfter: 20, handTotal: 6 },
        { id: "other", name: "Other", scoreBefore: 30, scoreAfter: 39, handTotal: 9 },
      ],
      callerId: "caller",
      assaf: true,
    });

    expect(events.map((event) => event.playerId)).toEqual(["winner", "caller", "other"]);
    expect(events.map((event) => event.delayMs)).toEqual([0, 240, 720]);
    expect(events.find((event) => event.playerId === "caller")).toMatchObject({
      scoreDelta: 30,
      tone: "penalty",
      intensity: "strong",
    });
    expect(events.find((event) => event.playerId === "winner")).toMatchObject({
      scoreDelta: 0,
      tone: "safe",
      intensity: "low",
    });
    expect(events.find((event) => event.playerId === "other")).toMatchObject({
      scoreDelta: 9,
      tone: "score",
      intensity: "medium",
    });
  });
});
