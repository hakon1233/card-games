import { describe, expect, it } from "vitest";

import {
  ANIMATION_SPEED_STORAGE_KEY,
  animationSpeedLabel,
  coerceAnimationSpeed,
  getInitialAnimationSpeed,
  scaleAnimationDuration,
} from "./animation-preferences";

describe("animation preferences", () => {
  it("accepts only supported stored animation speed values", () => {
    expect(coerceAnimationSpeed("normal")).toBe("normal");
    expect(coerceAnimationSpeed("fast")).toBe("fast");
    expect(coerceAnimationSpeed("reduced")).toBe("reduced");
    expect(coerceAnimationSpeed("slow")).toBeNull();
    expect(coerceAnimationSpeed(null)).toBeNull();
  });

  it("prefers a valid stored value over the OS reduced-motion hint", () => {
    const storage = new Map<string, string>([[ANIMATION_SPEED_STORAGE_KEY, "fast"]]);

    expect(
      getInitialAnimationSpeed({
        getStoredValue: (key) => storage.get(key) ?? null,
        prefersReducedMotion: () => true,
      }),
    ).toBe("fast");
  });

  it("defaults to reduced motion when the OS asks for it and no setting is stored", () => {
    expect(
      getInitialAnimationSpeed({
        getStoredValue: () => null,
        prefersReducedMotion: () => true,
      }),
    ).toBe("reduced");
  });

  it("scales cosmetic durations for fast play and reduce-animation modes", () => {
    expect(scaleAnimationDuration(2000, "normal")).toBe(2000);
    expect(scaleAnimationDuration(2000, "fast")).toBe(900);
    expect(scaleAnimationDuration(2000, "reduced")).toBe(1);
  });

  it("provides short labels for table controls", () => {
    expect(animationSpeedLabel("normal")).toBe("Normal");
    expect(animationSpeedLabel("fast")).toBe("Fast");
    expect(animationSpeedLabel("reduced")).toBe("Reduced");
  });
});
