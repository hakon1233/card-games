"use client";

import { Accessibility, Gauge, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";

import {
  ANIMATION_SPEED_STORAGE_KEY,
  ANIMATION_SPEEDS,
  animationSpeedLabel,
  getInitialAnimationSpeed,
  type AnimationSpeed,
} from "@/lib/animation-preferences";

const ICONS = {
  normal: Gauge,
  fast: Zap,
  reduced: Accessibility,
} satisfies Record<AnimationSpeed, ComponentType<{ className?: string; "aria-hidden"?: boolean }>>;

function readInitialSpeed(): AnimationSpeed {
  if (typeof window === "undefined") return "normal";
  return getInitialAnimationSpeed({
    getStoredValue: (key) => window.localStorage.getItem(key),
    prefersReducedMotion: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
}

function applyAnimationSpeed(speed: AnimationSpeed) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.animationSpeed = speed;
}

export function useAnimationSpeed() {
  const [speed, setSpeed] = useState<AnimationSpeed>(readInitialSpeed);

  useEffect(() => {
    applyAnimationSpeed(speed);
  }, [speed]);

  function updateSpeed(next: AnimationSpeed) {
    setSpeed(next);
    try {
      window.localStorage.setItem(ANIMATION_SPEED_STORAGE_KEY, next);
    } catch {
      // Non-critical preference persistence.
    }
  }

  return [speed, updateSpeed] as const;
}

export function AnimationPreferencesProvider() {
  useEffect(() => {
    applyAnimationSpeed(readInitialSpeed());
  }, []);

  return null;
}

export function AnimationPreferencesControl({
  value,
  onChange,
}: {
  value: AnimationSpeed;
  onChange: (speed: AnimationSpeed) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {ANIMATION_SPEEDS.map((speed) => {
        const Icon = ICONS[speed];
        const selected = value === speed;
        return (
          <button
            key={speed}
            type="button"
            onClick={() => onChange(speed)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors ${
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            aria-pressed={selected}
            title={`${animationSpeedLabel(speed)} animation speed`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{animationSpeedLabel(speed)}</span>
          </button>
        );
      })}
    </div>
  );
}
