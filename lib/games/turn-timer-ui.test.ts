import { describe, expect, it } from "vitest";

import { getTurnTimerUrgency, shouldPlayLowTimeCue } from "./turn-timer-ui";

describe("turn timer UI helpers", () => {
  it("escalates urgency as the turn clock depletes", () => {
    expect(getTurnTimerUrgency(0.8)).toBe("normal");
    expect(getTurnTimerUrgency(0.4)).toBe("warning");
    expect(getTurnTimerUrgency(0.2)).toBe("critical");
  });

  it("plays the low-time cue once when crossing the low-time threshold", () => {
    expect(shouldPlayLowTimeCue({ previousMs: 6100, remainingMs: 5900, thresholdMs: 6000 })).toBe(true);
    expect(shouldPlayLowTimeCue({ previousMs: 5900, remainingMs: 5800, thresholdMs: 6000 })).toBe(false);
    expect(shouldPlayLowTimeCue({ previousMs: null, remainingMs: 5900, thresholdMs: 6000 })).toBe(false);
  });
});
