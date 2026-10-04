"use client";

// The turn clock: the countdown you have to act before a safe discard is played for you.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { YanivGameState } from "@/lib/games/yaniv";

// Soft per-turn clock (playtest default). Drives the co-located countdown ring
// on the active player's avatar so "how long do they have" is answerable at a
// glance. On expiry the human auto-plays a safe default so the game never stalls.
const TURN_SECONDS = 20;
const TURN_MS = TURN_SECONDS * 1000;
const LOW_TIME_CUE_MS = 6000;

/** Changes whenever playerId gets a new turn to act on; null while it is not their turn. */
export function getTurnClockKey(state: YanivGameState | null, playerId: string): string | null {
  const activePlayer = state?.players[state.currentPlayerIndex];
  if (
    !state ||
    state.status !== "in_progress" ||
    state.quickDrawWindow ||
    activePlayer?.id !== playerId
  ) {
    return null;
  }

  const handKey = activePlayer.hand.map((card) => `${card.suit}-${card.rank}`).join(",");
  return [
    state.round,
    state.currentPlayerIndex,
    activePlayer.id,
    handKey,
    state.deck.length,
    state.discardPile.length,
  ].join(":");
}

type TurnTimerUrgency = "normal" | "warning" | "critical";

export function getTurnTimerUrgency(progress: number): TurnTimerUrgency {
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0.25) return "critical";
  if (clamped <= 0.5) return "warning";
  return "normal";
}

export function shouldPlayLowTimeCue({
  previousMs,
  remainingMs,
  thresholdMs,
}: {
  previousMs: number | null;
  remainingMs: number;
  thresholdMs: number;
}): boolean {
  return previousMs !== null && previousMs > thresholdMs && remainingMs <= thresholdMs;
}

/** A Quick Draw window's time left, in tenths of a second. */
export function formatQuickDrawTime(timeLeftMs: number): string {
  return `${(Math.max(0, timeLeftMs) / 1000).toFixed(1)}s`;
}

// Per-turn countdown value broadcast (CAR-182). The active player's turn timer
// ticks ~10×/second; the ticking `remaining` lives in <TurnCountdown> and is
// published through this context, so only the ring + the "Ns" readout re-render
// each tick — not the whole /play/yaniv table.
type TurnCountdownValue = { progress: number; secondsLeft: number };
const TurnCountdownContext = createContext<TurnCountdownValue | null>(null);

function playLowTimeCue() {
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return;
  const audio = new AudioContextCtor();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(880, audio.currentTime);
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.18);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.2);
  oscillator.addEventListener("ended", () => void audio.close());
}

// ── TurnCountdownRing ─────────────────────────────────────────────────────
// Thin ring co-located around the active avatar, depleting over the turn.
// Colour shifts turn-hue → amber → vermilion as time runs low (colour as
// information). Uses the reserved --state-* tokens from the GAM-54 colour
// system, not decorative hues: turn (gold) → warn (amber) → alert (vermilion).
function TurnCountdownRing({ progress }: { progress: number }) {
  const size = 52;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  const urgency = getTurnTimerUrgency(progress);
  const color =
    urgency === "normal"
      ? "var(--state-turn)"
      : urgency === "warning"
      ? "var(--state-warn)"
      : "var(--state-alert)";
  return (
    <svg
      width={size}
      height={size}
      className="absolute pointer-events-none"
      style={{
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%) rotate(-90deg)",
      }}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="color-mix(in oklab, var(--state-turn) 18%, transparent)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.1s linear, stroke 0.3s linear" }}
      />
    </svg>
  );
}

// ── TurnCountdown (perf isolation, CAR-182) ───────────────────────────────
// Owns the single per-turn 100ms interval, the ticking `remaining`, and every
// side effect the old page-level effect had (low-time cue + auto-play on
// expiry, with the BUG-GAM-76 generation guard). It publishes only
// {progress, secondsLeft} through TurnCountdownContext, so a 10Hz tick
// re-renders just LiveTurnCountdownRing / LiveTurnSeconds — never `children`
// (the whole PlayerRing/table tree). Semantics are identical to before: same
// TURN_MS / LOW_TIME_CUE_MS, same auto-play-safe-default-on-expiry.
export function TurnCountdown({
  turnKey,
  lowTimeSound,
  turnClockGenerationRef,
  onExpire,
  children,
}: {
  turnKey: string | null;
  lowTimeSound: boolean;
  turnClockGenerationRef: React.RefObject<number>;
  onExpire: () => void;
  children: React.ReactNode;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const previousRemainingRef = useRef<number | null>(null);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!turnKey) {
      // queueMicrotask defers the reset out of the effect body so it doesn't
      // trip react-hooks/set-state-in-effect (synchronous setState).
      queueMicrotask(() => setRemaining(null));
      previousRemainingRef.current = null;
      return;
    }
    queueMicrotask(() => setRemaining(TURN_MS));
    // Pin the turn this interval belongs to; if a dispatch advances the turn
    // (generation bump) the in-flight tick must not auto-play into it.
    const turnClockGeneration = turnClockGenerationRef.current;
    previousRemainingRef.current = TURN_MS;
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (turnClockGeneration !== turnClockGenerationRef.current) {
        clearInterval(interval);
        return;
      }
      const remaining = Math.max(0, TURN_MS - (Date.now() - startTime));
      if (
        lowTimeSound &&
        shouldPlayLowTimeCue({
          previousMs: previousRemainingRef.current,
          remainingMs: remaining,
          thresholdMs: LOW_TIME_CUE_MS,
        })
      ) {
        playLowTimeCue();
      }
      previousRemainingRef.current = remaining;
      setRemaining(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        onExpireRef.current();
      }
    }, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, lowTimeSound]);

  const value = useMemo<TurnCountdownValue | null>(() => {
    if (remaining === null) return null;
    return { progress: remaining / TURN_MS, secondsLeft: Math.ceil(remaining / 1000) };
  }, [remaining]);

  return (
    <TurnCountdownContext.Provider value={value}>
      {children}
    </TurnCountdownContext.Provider>
  );
}

// Leaf consumers — the only nodes that re-render on each 100ms tick.
export function LiveTurnCountdownRing() {
  const value = useContext(TurnCountdownContext);
  return <TurnCountdownRing progress={value?.progress ?? 1} />;
}

export function LiveTurnSeconds() {
  const value = useContext(TurnCountdownContext);
  if (value === null) return null;
  return <>{` · ${value.secondsLeft}s`}</>;
}
