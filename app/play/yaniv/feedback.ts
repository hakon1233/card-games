"use client";

// What the Yaniv table flashes and plays as the game moves: a badge for each move, the score
// cascade when a round ends, the reshuffle banner, the next-up preview, and their sounds.

import { useCallback, useEffect, useRef, useState } from "react";
import { scaleAnimationDuration, type AnimationSpeed } from "@/lib/animation-preferences";
import type { YanivAction, YanivGameState } from "@/lib/games/yaniv";
import {
  buildYanivScoreCascade,
  type YanivFeedbackTone,
  type YanivScoreCascadeEvent,
} from "@/lib/games/yaniv-feedback";
import { getTurnPreviewName } from "@/lib/games/yaniv-turn-preview";

const TURN_PREVIEW_MS = 1400;

export type ActionBadge = { text: string; variant: "drew" | "yaniv" | "stolen"; key: number };
export type ScoreFeedback = YanivScoreCascadeEvent & { key: number };

function playFeedbackCue(tone: YanivFeedbackTone) {
  const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
  const AudioContextCtor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextCtor) return;
  const audio = new AudioContextCtor();
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = tone === "penalty" ? "square" : "triangle";
  oscillator.frequency.setValueAtTime(
    tone === "safe" ? 660 : tone === "penalty" ? 180 : 440,
    audio.currentTime,
  );
  if (tone === "score") oscillator.frequency.exponentialRampToValueAtTime(740, audio.currentTime + 0.16);
  gain.gain.setValueAtTime(0.0001, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(tone === "penalty" ? 0.06 : 0.045, audio.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.2);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + 0.22);
  oscillator.addEventListener("ended", () => void audio.close());
}

function actionBadgeInfo(
  action: YanivAction,
): { playerId: string; text: string; variant: ActionBadge["variant"] } | null {
  if (action.type === "CALL_YANIV") return { playerId: action.playerId, text: "YANIV!", variant: "yaniv" };
  if (action.type === "QUICK_DRAW_STEAL") return { playerId: action.playerId, text: "Stolen!", variant: "stolen" };
  if (action.type === "DISCARD_AND_DRAW") {
    return {
      playerId: action.playerId,
      text: action.drawFromDiscard ? "Drew pile" : "Drew",
      variant: "drew",
    };
  }
  return null;
}

export function useYanivFeedback(
  gameState: YanivGameState | null,
  animationSpeed: AnimationSpeed,
  nextUpPreview: boolean,
) {
  const [reshuffled, setReshuffled] = useState(false);
  const [actionBadges, setActionBadges] = useState<Record<string, ActionBadge>>({});
  const [scoreFeedback, setScoreFeedback] = useState<Record<string, ScoreFeedback>>({});
  const [roundOverlayReady, setRoundOverlayReady] = useState(true);
  const [turnPreview, setTurnPreview] = useState<{ name: string; key: number } | null>(null);

  const prevDeckLengthRef = useRef<number | null>(null);
  const badgeKeyRef = useRef(0);
  const scoreFeedbackKeyRef = useRef(0);
  const badgeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scoreFeedbackTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previousTurnPlayerIdRef = useRef<string | null>(null);
  const turnPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeTurnPlayerId =
    gameState?.status === "in_progress" && !gameState.quickDrawWindow
      ? gameState.players[gameState.currentPlayerIndex]?.id ?? null
      : null;
  const activeTurnKey =
    gameState && activeTurnPlayerId
      ? `${gameState.round}:${gameState.currentPlayerIndex}:${activeTurnPlayerId}`
      : null;

  useEffect(() => {
    return () => {
      if (turnPreviewTimerRef.current) clearTimeout(turnPreviewTimerRef.current);
      scoreFeedbackTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!gameState || !activeTurnKey) return;

    const previewName = getTurnPreviewName(
      gameState.players,
      gameState.currentPlayerIndex,
      previousTurnPlayerIdRef.current,
    );
    previousTurnPlayerIdRef.current = activeTurnPlayerId;

    if (!previewName || !nextUpPreview) return;
    setTurnPreview({ name: previewName, key: Date.now() });
    if (turnPreviewTimerRef.current) clearTimeout(turnPreviewTimerRef.current);
    turnPreviewTimerRef.current = setTimeout(() => setTurnPreview(null), TURN_PREVIEW_MS);
  }, [activeTurnKey, activeTurnPlayerId, gameState, nextUpPreview]);

  useEffect(() => {
    if (!gameState) return;
    const curr = gameState.deck.length;
    const prev = prevDeckLengthRef.current;
    prevDeckLengthRef.current = curr;
    if (prev !== null && prev === 0 && curr > 0) {
      setReshuffled(true);
      const timer = setTimeout(
        () => setReshuffled(false),
        scaleAnimationDuration(2000, animationSpeed),
      );
      return () => clearTimeout(timer);
    }
  }, [gameState, animationSpeed]);

  function showBadge(playerId: string, text: string, variant: ActionBadge["variant"]) {
    const key = ++badgeKeyRef.current;
    setActionBadges((prev) => ({ ...prev, [playerId]: { text, variant, key } }));
    clearTimeout(badgeTimersRef.current[playerId]);
    badgeTimersRef.current[playerId] = setTimeout(() => {
      setActionBadges((prev) => {
        const n = { ...prev };
        delete n[playerId];
        return n;
      });
    }, scaleAnimationDuration(2000, animationSpeed));
  }

  const clearScoreFeedbackTimers = useCallback(() => {
    scoreFeedbackTimersRef.current.forEach(clearTimeout);
    scoreFeedbackTimersRef.current = [];
  }, []);

  function scheduleScoreCascade(before: YanivGameState, after: YanivGameState) {
    if (!after.roundResult) return;

    clearScoreFeedbackTimers();
    setScoreFeedback({});
    setRoundOverlayReady(false);

    const events = buildYanivScoreCascade({
      callerId: after.roundResult.callerId,
      assaf: after.roundResult.assaf,
      players: after.players
        .filter((player) => after.roundResult?.handTotals[player.id] !== undefined)
        .map((player) => {
          const beforePlayer = before.players.find((p) => p.id === player.id);
          return {
            id: player.id,
            name: player.name,
            scoreBefore: beforePlayer?.score ?? player.score,
            scoreAfter: player.score,
            handTotal: after.roundResult?.handTotals[player.id] ?? 0,
          };
        }),
    });

    let overlayDelayMs = 0;
    events.forEach((event) => {
      const delayMs = scaleAnimationDuration(event.delayMs, animationSpeed);
      const durationMs = scaleAnimationDuration(event.durationMs, animationSpeed);
      overlayDelayMs = Math.max(overlayDelayMs, delayMs + durationMs + 300);
      const startTimer = setTimeout(() => {
        const feedback = { ...event, durationMs, key: ++scoreFeedbackKeyRef.current };
        setScoreFeedback((prev) => ({ ...prev, [event.playerId]: feedback }));
        playFeedbackCue(event.tone);
      }, delayMs);
      const endTimer = setTimeout(() => {
        setScoreFeedback((prev) => {
          const next = { ...prev };
          delete next[event.playerId];
          return next;
        });
      }, delayMs + durationMs + scaleAnimationDuration(700, animationSpeed));
      scoreFeedbackTimersRef.current.push(startTimer, endTimer);
    });

    const overlayTimer = setTimeout(() => setRoundOverlayReady(true), overlayDelayMs);
    scoreFeedbackTimersRef.current.push(overlayTimer);
  }

  function applyActionFeedback(action: YanivAction, before: YanivGameState, after: YanivGameState) {
    const info = actionBadgeInfo(action);
    if (info) {
      showBadge(info.playerId, info.text, info.variant);
      if (action.type !== "CALL_YANIV") playFeedbackCue(action.type === "QUICK_DRAW_STEAL" ? "penalty" : "score");
    }
    if (action.type === "CALL_YANIV" && after.roundResult) {
      scheduleScoreCascade(before, after);
    }
  }

  /** Clear the last round's badges and scores, for a new round. */
  const resetRound = useCallback(() => {
    setActionBadges({});
    clearScoreFeedbackTimers();
    setScoreFeedback({});
    setRoundOverlayReady(true);
  }, [clearScoreFeedbackTimers]);

  /** Clear everything, for a new game. */
  const resetGame = useCallback(() => {
    resetRound();
    previousTurnPlayerIdRef.current = null;
    setTurnPreview(null);
    if (turnPreviewTimerRef.current) clearTimeout(turnPreviewTimerRef.current);
  }, [resetRound]);

  return {
    actionBadges,
    scoreFeedback,
    roundOverlayReady,
    reshuffled,
    turnPreview,
    onMove: applyActionFeedback,
    resetRound,
    resetGame,
  };
}
