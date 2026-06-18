"use client";

import { useState, useCallback, useEffect, useId, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  AnimationPreferencesControl,
  useAnimationSpeed,
} from "@/components/game/animation-preferences-control";
import {
  CardDeckControl,
  useCardDeck,
} from "@/components/game/card-deck-control";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { CardHand } from "@/components/game/card-hand";
import { PlayingCard } from "@/components/game/card";
import { scaleAnimationDuration } from "@/lib/animation-preferences";
import {
  dealGame,
  applyAction,
  canCallYaniv,
  yanivCardValue,
  describeSelection,
  getDiscardTopGroup,
  canAddToSelection,
  getFinalStandings,
  DEFAULT_YANIV_SETTINGS,
  type YanivGameState,
  type YanivPlayer,
  type YanivSettings,
  type YanivAction,
  type YanivQuickDrawWindow,
  type SelectionDescription,
} from "@/lib/games/yaniv";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import {
  buildYanivScoreCascade,
  type YanivFeedbackTone,
  type YanivScoreCascadeEvent,
} from "@/lib/games/yaniv-feedback";
import { formatQuickDrawTime } from "@/lib/games/quick-draw-ui";
import { getYanivHandReadout } from "@/lib/games/yaniv-readout";
import { getYanivRingLayout, type YanivTableFormFactor } from "@/lib/games/yaniv-layout";
import { getYanivScoreboardRows, type YanivScoreboardRow } from "@/lib/games/yaniv-scoreboard";
import { getTurnPreviewName } from "@/lib/games/yaniv-turn-preview";
import { getTurnClockKey } from "@/lib/games/turn-clock";
import { getTurnTimerUrgency, shouldPlayLowTimeCue } from "@/lib/games/turn-timer-ui";
import type { ShellCard } from "@/lib/games/shell-types";

const PLAYER_ID = "player-1";
const SETTINGS_KEY = "yaniv-settings";
const QUICK_DRAW_MS = 2000;
const TURN_PREVIEW_MS = 1400;
// Soft per-turn clock (playtest default). Drives the co-located countdown ring
// on the active player's avatar so "how long do they have" is answerable at a
// glance. On expiry the human auto-plays a safe default so the game never stalls.
const TURN_SECONDS = 20;
const TURN_MS = TURN_SECONDS * 1000;
const LOW_TIME_CUE_MS = 6000;
const bot = new YanivBot();

type ActionBadge = { text: string; variant: "drew" | "yaniv" | "stolen"; key: number };
type ScoreFeedback = YanivScoreCascadeEvent & { key: number };
type YanivLocalSettings = YanivSettings & {
  numBots: number;
  lowTimeSound: boolean;
  idlePulses: boolean;
  nextUpPreview: boolean;
};

const DEFAULT_LOCAL_SETTINGS: YanivLocalSettings = {
  ...DEFAULT_YANIV_SETTINGS,
  numBots: 1,
  lowTimeSound: false,
  idlePulses: true,
  nextUpPreview: true,
};

function buildPlayerDefs(numBots: number) {
  const defs: { id: string; name: string; isBot: boolean }[] = [
    { id: PLAYER_ID, name: "You", isBot: false },
  ];
  for (let i = 1; i <= numBots; i++) {
    defs.push({ id: `bot-${i}`, name: `Bot ${i}`, isBot: true });
  }
  return defs;
}

function loadSettings(): YanivLocalSettings {
  if (typeof window === "undefined") return DEFAULT_LOCAL_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_LOCAL_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_LOCAL_SETTINGS;
}

function saveSettings(s: YanivLocalSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

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

function toShellCard(card: { suit: string; rank: string }, faceUp = true): ShellCard {
  return { suit: card.suit as ShellCard["suit"], rank: card.rank as ShellCard["rank"], faceUp };
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

function getNextActiveIdx(players: YanivPlayer[], currentIdx: number): number {
  const N = players.length;
  for (let step = 1; step < N; step++) {
    const idx = (currentIdx + step) % N;
    if (!players[idx].eliminated) return idx;
  }
  return -1;
}

function useYanivTableFormFactor(): YanivTableFormFactor {
  const [formFactor, setFormFactor] = useState<YanivTableFormFactor>("standard");

  useEffect(() => {
    const update = () => {
      if (window.matchMedia("(orientation: portrait) and (max-width: 720px)").matches) {
        setFormFactor("portrait");
      } else if (window.matchMedia("(min-width: 720px) and (min-aspect-ratio: 4/3)").matches) {
        setFormFactor("widescreen");
      } else {
        setFormFactor("standard");
      }
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return formFactor;
}

function runBotLoop(state: YanivGameState): YanivGameState {
  let s = state;
  let guard = 0;
  while (
    s.status === "in_progress" &&
    !s.quickDrawWindow &&
    s.players[s.currentPlayerIndex]?.isBot &&
    guard < 20
  ) {
    s = applyAction(s, bot.getNextMove(s, s.players[s.currentPlayerIndex].id));
    guard++;
  }
  return s;
}

export default function YanivPage() {
  const router = useRouter();
  const formFactor = useYanivTableFormFactor();
  const [gameState, setGameState] = useState<YanivGameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [roundsWon, setRoundsWon] = useState(0);
  const [roundsLost, setRoundsLost] = useState(0);
  const [reshuffled, setReshuffled] = useState(false);
  const [actionBadges, setActionBadges] = useState<Record<string, ActionBadge>>({});
  const [scoreFeedback, setScoreFeedback] = useState<Record<string, ScoreFeedback>>({});
  const [roundOverlayReady, setRoundOverlayReady] = useState(true);

  const prevDeckLengthRef = useRef<number | null>(null);
  const gameStateRef = useRef<YanivGameState | null>(null);
  const badgeKeyRef = useRef(0);
  const scoreFeedbackKeyRef = useRef(0);
  const badgeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const scoreFeedbackTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previousTurnPlayerIdRef = useRef<string | null>(null);
  const turnPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousTurnTimeLeftRef = useRef<number | null>(null);

  const [numBots, setNumBots] = useState(1);
  const [yanivThreshold, setYanivThreshold] = useState(DEFAULT_YANIV_SETTINGS.yanivThreshold);
  const [scoreLimit, setScoreLimit] = useState(DEFAULT_YANIV_SETTINGS.scoreLimit);
  const [quickDraw, setQuickDraw] = useState(DEFAULT_YANIV_SETTINGS.quickDraw);
  const [lowTimeSound, setLowTimeSound] = useState(DEFAULT_LOCAL_SETTINGS.lowTimeSound);
  const [idlePulses, setIdlePulses] = useState(DEFAULT_LOCAL_SETTINGS.idlePulses);
  const [nextUpPreview, setNextUpPreview] = useState(DEFAULT_LOCAL_SETTINGS.nextUpPreview);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [qdTimeLeft, setQdTimeLeft] = useState<number | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number | null>(null);
  const [turnPreview, setTurnPreview] = useState<{ name: string; key: number } | null>(null);
  const [animationSpeed, setAnimationSpeed] = useAnimationSpeed();
  const [cardDeck, setCardDeck] = useCardDeck();

  const qdWindowKey = gameState?.quickDrawWindow
    ? `${gameState.quickDrawWindow.discarderId}:${gameState.discardPile.length}`
    : null;
  const activeTurnPlayerId =
    gameState?.status === "in_progress" && !gameState.quickDrawWindow
      ? gameState.players[gameState.currentPlayerIndex]?.id ?? null
      : null;
  const activeTurnKey =
    gameState && activeTurnPlayerId
      ? `${gameState.round}:${gameState.currentPlayerIndex}:${activeTurnPlayerId}`
      : null;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

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

  function clearScoreFeedbackTimers() {
    scoreFeedbackTimersRef.current.forEach(clearTimeout);
    scoreFeedbackTimersRef.current = [];
  }

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

  function dispatch(state: YanivGameState, triggerAction?: YanivAction, previousState?: YanivGameState) {
    if (triggerAction) {
      applyActionFeedback(triggerAction, previousState ?? state, state);
    }

    let s = state;
    let guard = 0;
    while (
      s.status === "in_progress" &&
      !s.quickDrawWindow &&
      s.players[s.currentPlayerIndex]?.isBot &&
      guard < 20
    ) {
      const botId = s.players[s.currentPlayerIndex].id;
      const action = bot.getNextMove(s, botId);
      const beforeAction = s;
      s = applyAction(s, action);
      applyActionFeedback(action, beforeAction, s);
      guard++;
    }

    setGameState(s);
    setSelected([]);
    if (s.status === "round_over" || s.status === "game_over") {
      const result = s.roundResult;
      if (result) {
        const playerWon = result.callerId === PLAYER_ID && !result.assaf;
        if (playerWon) setRoundsWon((n) => n + 1);
        else setRoundsLost((n) => n + 1);
      }
    }
  }

  useEffect(() => {
    const saved = loadSettings();
    queueMicrotask(() => {
      setNumBots(saved.numBots);
      setYanivThreshold(saved.yanivThreshold);
      setScoreLimit(saved.scoreLimit);
      setQuickDraw(saved.quickDraw);
      setLowTimeSound(saved.lowTimeSound);
      setIdlePulses(saved.idlePulses);
      setNextUpPreview(saved.nextUpPreview);
      setSettingsLoaded(true);
    });
  }, []);

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

  useEffect(() => {
    if (!qdWindowKey) {
      queueMicrotask(() => setQdTimeLeft(null));
      return;
    }
    queueMicrotask(() => setQdTimeLeft(QUICK_DRAW_MS));
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, QUICK_DRAW_MS - elapsed);
      setQdTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        const s = gameStateRef.current;
        if (s?.quickDrawWindow) {
          dispatch(applyAction(s, { type: "QUICK_DRAW_EXPIRE" }), { type: "QUICK_DRAW_EXPIRE" }, s);
        }
      }
    }, 50);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qdWindowKey]);

  useEffect(() => {
    if (!gameState?.quickDrawWindow) return;
    const win = gameState.quickDrawWindow;
    if (win.discarderId !== PLAYER_ID) return;
    const stealingBot = gameState.players.find(
      (p) => p.isBot && bot.shouldQuickDraw(gameState, p.id),
    );
    if (!stealingBot) return;
    const botId = stealingBot.id;
    const delay = 300 + Math.random() * 1300;
    const timeout = setTimeout(() => {
      const s = gameStateRef.current;
      if (!s?.quickDrawWindow) return;
      const action = { type: "QUICK_DRAW_STEAL" as const, playerId: botId };
      dispatch(applyAction(s, action), action, s);
    }, delay);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qdWindowKey]);

  // ── Per-turn countdown clock ───────────────────────────────────────────────
  // Runs only while the human is the active player (bots resolve synchronously,
  // so they never "sit" on a turn). Resets whenever the active turn changes.
  const turnKey = getTurnClockKey(gameState, PLAYER_ID);

  const autoPlayTurnTimeout = useCallback(() => {
    const s = gameStateRef.current;
    if (!s || s.status !== "in_progress" || s.quickDrawWindow) return;
    if (s.players[s.currentPlayerIndex]?.id !== PLAYER_ID) return;
    const human = s.players.find((p) => p.id === PLAYER_ID);
    if (!human || human.hand.length === 0) return;
    // Safe default: drop the single highest-value card and draw from the deck.
    let hi = 0;
    for (let i = 1; i < human.hand.length; i++) {
      if (yanivCardValue(human.hand[i].rank) > yanivCardValue(human.hand[hi].rank)) hi = i;
    }
    const action = {
      type: "DISCARD_AND_DRAW" as const,
      playerId: PLAYER_ID,
      discardIndices: [hi],
      drawFromDiscard: false,
    };
    dispatch(applyAction(s, action), action, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!turnKey) {
      queueMicrotask(() => setTurnTimeLeft(null));
      previousTurnTimeLeftRef.current = null;
      return;
    }
    queueMicrotask(() => setTurnTimeLeft(TURN_MS));
    previousTurnTimeLeftRef.current = TURN_MS;
    const startTime = Date.now();
    const interval = setInterval(() => {
      const remaining = Math.max(0, TURN_MS - (Date.now() - startTime));
      if (
        lowTimeSound &&
        shouldPlayLowTimeCue({
          previousMs: previousTurnTimeLeftRef.current,
          remainingMs: remaining,
          thresholdMs: LOW_TIME_CUE_MS,
        })
      ) {
        playLowTimeCue();
      }
      previousTurnTimeLeftRef.current = remaining;
      setTurnTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        autoPlayTurnTimeout();
      }
    }, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnKey, lowTimeSound]);

  const startGame = useCallback(() => {
    const settings: YanivSettings = { yanivThreshold, scoreLimit, quickDraw };
    saveSettings({ ...settings, numBots, lowTimeSound, idlePulses, nextUpPreview });
    const initial = dealGame(`game-${Date.now()}`, buildPlayerDefs(numBots), settings);
    setGameState(runBotLoop(initial));
    setSelected([]);
    setRoundsWon(0);
    setRoundsLost(0);
    setActionBadges({});
    clearScoreFeedbackTimers();
    setScoreFeedback({});
    setRoundOverlayReady(true);
    previousTurnPlayerIdRef.current = null;
    setTurnPreview(null);
    if (turnPreviewTimerRef.current) clearTimeout(turnPreviewTimerRef.current);
  }, [numBots, yanivThreshold, scoreLimit, quickDraw, lowTimeSound, idlePulses, nextUpPreview]);

  function callYaniv() {
    if (!gameState) return;
    const action = { type: "CALL_YANIV" as const, playerId: PLAYER_ID };
    dispatch(applyAction(gameState, action), action, gameState);
  }

  function discardAndDraw(drawFromDiscard: boolean, drawDiscardIndex?: number) {
    if (!gameState || selected.length === 0) return;
    const action = {
      type: "DISCARD_AND_DRAW" as const,
      playerId: PLAYER_ID,
      discardIndices: selected,
      drawFromDiscard,
      drawDiscardIndex,
    };
    dispatch(applyAction(gameState, action), action, gameState);
  }

  function stealFromDiscard() {
    if (!gameState?.quickDrawWindow) return;
    const action = { type: "QUICK_DRAW_STEAL" as const, playerId: PLAYER_ID };
    dispatch(applyAction(gameState, action), action, gameState);
  }

  function nextRound() {
    if (!gameState) return;
    const s = runBotLoop(applyAction(gameState, { type: "NEXT_ROUND", playerId: PLAYER_ID }));
    setGameState(s);
    setSelected([]);
    setActionBadges({});
    clearScoreFeedbackTimers();
    setScoreFeedback({});
    setRoundOverlayReady(true);
  }

  function toggleCard(idx: number) {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  // ── Settings screen ──────────────────────────────────────────────────────
  if (!gameState) {
    return (
      <div className="flex flex-col min-h-screen bg-background">
        <BrandHeader title="Yaniv" backLabel="Back" />
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm flex flex-col gap-6 rounded-lg border border-border bg-card/70 p-5 shadow-sm">
            <div className="text-center">
              <p className="pip-eyebrow text-xs">Yaniv table</p>
              <h2 className="mt-2 font-heading text-2xl font-bold text-foreground">Game Settings</h2>
            </div>

            <SettingRow label="Number of Bots">
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setNumBots(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      numBots === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </SettingRow>

            <SettingRow label="Yaniv Call Threshold">
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 13 }, (_, i) => i + 3).map((n) => (
                  <button
                    key={n}
                    onClick={() => setYanivThreshold(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      yanivThreshold === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs mt-1">Maximum hand total to call Yaniv</p>
            </SettingRow>

            <SettingRow label="Elimination Score">
              <div className="flex gap-2">
                {[100, 150, 200, 300].map((n) => (
                  <button
                    key={n}
                    onClick={() => setScoreLimit(n)}
                    className={`px-3 h-9 rounded-lg text-sm font-semibold transition-colors ${
                      scoreLimit === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground text-xs mt-1">Score at which a player is eliminated</p>
            </SettingRow>

            <SettingRow label="Quick Draw">
              <button
                onClick={() => setQuickDraw((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  quickDraw ? "bg-primary" : "bg-input"
                }`}
                role="switch"
                aria-checked={quickDraw}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    quickDraw ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
              <p className="text-muted-foreground text-xs mt-1">2-second window to pick up discarded cards</p>
            </SettingRow>

            <SettingRow label="Animation Speed">
              <AnimationPreferencesControl
                value={animationSpeed}
                onChange={setAnimationSpeed}
              />
              <p className="text-muted-foreground text-xs mt-1">
                Fast play shortens table motion; reduced minimizes movement.
              </p>
            </SettingRow>

            <SettingRow label="Card Colors">
              <CardDeckControl value={cardDeck} onChange={setCardDeck} />
              <p className="text-muted-foreground text-xs mt-1">
                Four-color gives each suit its own color, so suits stay easy to tell
                apart for colorblind players. Suit symbols always show too.
              </p>
            </SettingRow>

            <div className="grid grid-cols-2 gap-3">
              <SettingRow label="Low-Time Sound">
                <button
                  onClick={() => setLowTimeSound((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    lowTimeSound ? "bg-primary" : "bg-input"
                  }`}
                  role="switch"
                  aria-checked={lowTimeSound}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      lowTimeSound ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </SettingRow>

              <SettingRow label="Idle Pulses">
                <button
                  onClick={() => setIdlePulses((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    idlePulses ? "bg-primary" : "bg-input"
                  }`}
                  role="switch"
                  aria-checked={idlePulses}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      idlePulses ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </SettingRow>

              <SettingRow label="Next-Up Preview">
                <button
                  onClick={() => setNextUpPreview((v) => !v)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    nextUpPreview ? "bg-primary" : "bg-input"
                  }`}
                  role="switch"
                  aria-checked={nextUpPreview}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      nextUpPreview ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </SettingRow>
            </div>

            <Button
              onClick={startGame}
              disabled={!settingsLoaded}
              size="lg"
              className="w-full h-12 text-base font-bold mt-2"
            >
              Start Game
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Game screen ──────────────────────────────────────────────────────────
  const player = gameState.players.find((p) => p.id === PLAYER_ID)!;
  const isMyTurn =
    gameState.status === "in_progress" &&
    !gameState.quickDrawWindow &&
    gameState.players[gameState.currentPlayerIndex]?.id === PLAYER_ID;
  const handReadout = getYanivHandReadout(player.hand, gameState.settings.yanivThreshold);
  const playerTotal = handReadout.total;
  const canYaniv = isMyTurn && canCallYaniv(player.hand, gameState.settings.yanivThreshold);
  const selectedCards = selected.map((i) => player.hand[i]).filter(Boolean);
  const selection = describeSelection(selectedCards);
  const canDiscard = isMyTurn && selection.valid;
  const topGroup = getDiscardTopGroup(gameState);
  const isRoundOver = gameState.status === "round_over";
  const isGameOver = gameState.status === "game_over";
  const finalStandings = isGameOver ? getFinalStandings(gameState) : [];
  const winnerName = finalStandings.find((row) => row.isWinner)?.name;
  const qdWindow = gameState.quickDrawWindow;
  const qdActive = !!qdWindow;
  const qdPlayerCanSteal =
    qdActive &&
    !!qdWindow &&
    gameState.players.find((p) => p.id === qdWindow.discarderId)?.isBot === true;
  const qdTimerLabel = formatQuickDrawTime(qdTimeLeft ?? QUICK_DRAW_MS);
  const qdProgress = Math.max(0, Math.min(1, (qdTimeLeft ?? QUICK_DRAW_MS) / QUICK_DRAW_MS));

  const cardDisabled = player.hand.map((card, i) => {
    if (!isMyTurn) return true;
    if (selected.includes(i)) return false;
    return !canAddToSelection(selectedCards, card);
  });

  const nextPlayerIdx = getNextActiveIdx(gameState.players, gameState.currentPlayerIndex);
  const turnTimerActive = turnTimeLeft !== null;
  const turnProgress = turnTimerActive
    ? Math.max(0, Math.min(1, (turnTimeLeft ?? 0) / TURN_MS))
    : 1;
  const turnSecondsLeft = turnTimerActive ? Math.ceil((turnTimeLeft ?? 0) / 1000) : null;

  return (
    <div className="dark flex flex-col min-h-screen bg-[var(--pip-table)] text-foreground">
      {reshuffled && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-5 py-2 rounded-full shadow-xl font-medium text-sm pointer-events-none">
          Reshuffled!
        </div>
      )}
      {turnPreview && (
        <div
          key={turnPreview.key}
          className="fixed top-32 left-1/2 z-50 -translate-x-1/2 rounded-full border border-primary/40 bg-card/95 px-4 py-2 text-sm font-semibold text-card-foreground shadow-xl pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <span className="text-muted-foreground">Next up:</span>{" "}
          <span className="text-primary">{turnPreview.name}</span>
        </div>
      )}
      <BrandHeader title="Yaniv" tone="red" backLabel="Back" />

      <div className="yaniv-table-shell flex-1 flex flex-col p-3 md:p-5 gap-3 mx-auto w-full pip-table-surface pip-table-rail rounded-3xl">
        <div className="ml-auto w-full max-w-xs flex flex-col gap-2">
          <AnimationPreferencesControl
            value={animationSpeed}
            onChange={setAnimationSpeed}
          />
          <CardDeckControl value={cardDeck} onChange={setCardDeck} />
        </div>

        {/* Circular player ring */}
        <PlayerRing
          players={gameState.players}
          humanId={PLAYER_ID}
          currentPlayerIndex={gameState.currentPlayerIndex}
          nextPlayerIndex={nextPlayerIdx}
          turnTimerActive={turnTimerActive}
          turnProgress={turnProgress}
          turnSecondsLeft={turnSecondsLeft}
          idlePulses={idlePulses}
          actionBadges={actionBadges}
          scoreFeedback={scoreFeedback}
          qdActive={qdActive}
          qdWindow={qdWindow}
          qdProgress={qdProgress}
          qdTimeLeft={qdTimeLeft ?? 0}
          qdPlayerCanSteal={qdPlayerCanSteal}
          deckCount={gameState.deck.length}
          discardTopGroup={topGroup}
          canDrawFromDiscard={canDiscard}
          onPickDiscardCard={(idx) => discardAndDraw(true, idx)}
          onSteal={stealFromDiscard}
        />

        <div className="yaniv-bottom-zone flex flex-col gap-2">
        {/* Human player hand */}
        <div className="pip-seat-panel rounded-xl p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-foreground text-sm font-medium">
              {player.name}
              {isMyTurn && <span className="ml-2 text-primary text-xs">— your turn</span>}
            </span>
            <div className="flex flex-wrap items-center justify-end gap-2 text-xs tabular-nums">
              <span className="text-muted-foreground">Score: {player.score}</span>
              <ContextTooltip
                text={`Your hand total is ${handReadout.total}. You can call Yaniv at ${handReadout.threshold} or less.`}
                className="rounded-md"
              >
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/15 px-2 py-1 font-medium text-foreground"
                  aria-label={`Hand total ${handReadout.total}. Yaniv threshold ${handReadout.threshold}. ${
                    handReadout.withinThreshold
                      ? "You can call Yaniv on your turn."
                      : `${handReadout.distanceToThreshold} points over the Yaniv threshold.`
                  }`}
                >
                  <span>Hand {handReadout.total}</span>
                  <span className="text-muted-foreground">/</span>
                  <span
                    className={
                      handReadout.withinThreshold ? "text-emerald-300" : "text-amber-300"
                    }
                  >
                    {handReadout.withinThreshold
                      ? "Yaniv ready"
                      : `${handReadout.distanceToThreshold} over Yaniv`}
                  </span>
                </span>
              </ContextTooltip>
            </div>
          </div>
          <CardHand
            cards={player.hand.map((card) => toShellCard(card))}
            gameType="yaniv"
            formFactor={formFactor}
            selectedIndices={selected}
            disabledIndices={cardDisabled.map((isDisabled, i) => (isDisabled ? i : -1)).filter((i) => i >= 0)}
            onCardClick={(_, i) => toggleCard(i)}
            cardClassName={(_, i) => {
              const isSelected = selected.includes(i);
              const isDisabled = cardDisabled[i];
              return isDisabled
                ? "opacity-35 cursor-not-allowed"
                : isSelected
                  ? "-translate-y-4 card-selected-glow cursor-pointer"
                  : isMyTurn
                    ? "hover:-translate-y-1 cursor-pointer"
                    : "cursor-default";
            }}
          />
        </div>

        {/* Action buttons */}
        {isMyTurn && (
          <div className="flex flex-col gap-2">
            {canYaniv && (
              <ContextTooltip text="End the round now. If another player has an equal or lower hand, you take the Assaf penalty.">
                <Button
                  onClick={callYaniv}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
                >
                  Call Yaniv! (hand = {playerTotal})
                </Button>
              </ContextTooltip>
            )}
            {selected.length > 0 && (
              <SelectionSummary cards={selectedCards} selection={selection} />
            )}
            <div className="flex gap-2">
              <ContextTooltip
                text="Discard your selected legal set, then draw one unknown card from the deck."
                className="flex-1"
              >
                <Button
                  onClick={() => discardAndDraw(false)}
                  disabled={!canDiscard}
                  className="w-full"
                  variant="default"
                >
                  Discard &amp; Draw from Deck
                </Button>
              </ContextTooltip>
              <ContextTooltip
                text="Discard your selected legal set, then take one visible card from the top discard group."
                className="flex-1"
              >
                <Button
                  onClick={() => discardAndDraw(true)}
                  disabled={!canDiscard || topGroup.length === 0}
                  className="w-full"
                  variant="outline"
                >
                  Discard &amp; Take{" "}
                  {topGroup.length > 0
                    ? `${topGroup[topGroup.length - 1].rank}${suitSymbol(topGroup[topGroup.length - 1].suit)}`
                    : "pile"}
                </Button>
              </ContextTooltip>
            </div>
            {selected.length === 0 && !canYaniv && (
              <p className="text-muted-foreground text-xs text-center">
                Tap a card (or cards) to select, then discard
              </p>
            )}
          </div>
        )}

        {qdActive && (
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-400">
            <span className="animate-pulse">
              {qdPlayerCanSteal
                ? "Steal the discard? Click the highlighted card!"
                : "Quick-draw window — bot may steal…"}
            </span>
            <span
              className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs font-bold tabular-nums text-amber-300"
              role="timer"
              aria-live="polite"
            >
              {qdTimerLabel}
            </span>
          </div>
        )}
        {!isMyTurn && !qdActive && gameState.status === "in_progress" && (
          <p className="text-muted-foreground text-sm text-center">Bot is thinking…</p>
        )}
        </div>
      </div>

      {isRoundOver && gameState.roundResult && roundOverlayReady && (
        <RoundEndOverlay
          state={gameState}
          playerId={PLAYER_ID}
          onNextRound={nextRound}
          onChangeGame={() => router.push("/")}
        />
      )}

      {isGameOver && (
        <EndGameScreen
          headline={gameState.winnerId === PLAYER_ID ? "You Win!" : "Game Complete"}
          subline={
            gameState.winnerId === PLAYER_ID
              ? "You outlasted the table."
              : `${winnerName ?? "The winner"} outlasted the table.`
          }
          winnerName={winnerName}
          standings={finalStandings.map((row) => ({
            rank: row.rank,
            name: row.name,
            score: row.score,
            eliminated: row.eliminated,
            isWinner: row.isWinner,
          }))}
          sessionRows={[
            { label: "Rounds Won", value: roundsWon },
            { label: "Rounds Lost", value: roundsLost },
          ]}
          onPlayAgain={startGame}
          onChangeGame={() => router.push("/")}
        />
      )}
    </div>
  );
}

// ── PlayerRing ────────────────────────────────────────────────────────────

interface PlayerRingProps {
  players: YanivPlayer[];
  humanId: string;
  currentPlayerIndex: number;
  nextPlayerIndex: number;
  turnTimerActive: boolean;
  turnProgress: number;
  turnSecondsLeft: number | null;
  idlePulses: boolean;
  actionBadges: Record<string, ActionBadge>;
  scoreFeedback: Record<string, ScoreFeedback>;
  qdActive: boolean;
  qdWindow: YanivQuickDrawWindow | null;
  qdProgress: number;
  qdTimeLeft: number;
  qdPlayerCanSteal: boolean;
  deckCount: number;
  discardTopGroup: { suit: string; rank: string }[];
  canDrawFromDiscard: boolean;
  onPickDiscardCard: (idx: number) => void;
  onSteal: () => void;
}

function PlayerRing({
  players,
  humanId,
  currentPlayerIndex,
  nextPlayerIndex,
  turnTimerActive,
  turnProgress,
  turnSecondsLeft,
  idlePulses,
  actionBadges,
  scoreFeedback,
  qdActive,
  qdWindow,
  qdProgress,
  qdTimeLeft,
  qdPlayerCanSteal,
  deckCount,
  discardTopGroup,
  canDrawFromDiscard,
  onPickDiscardCard,
  onSteal,
}: PlayerRingProps) {
  const formFactor = useYanivTableFormFactor();
  const ringLayout = useMemo(
    () => getYanivRingLayout(players.map((player) => player.id), humanId, formFactor),
    [players, humanId, formFactor],
  );
  const seats = players.map((player, i) => {
    const seatLayout = ringLayout.seats[i];
    const isActive = i === currentPlayerIndex;
    const isNext = i === nextPlayerIndex && !isActive;
    return { player, xPct: seatLayout.xPct, yPct: seatLayout.yPct, isActive, isNext, angle: seatLayout.angle };
  });

  // Small clockwise arc indicator: from ~350° to ~50° (short arc at top-right)
  // In SVG viewBox 0 0 100 100; widescreen uses an ellipse, not a scaled circle.
  const arcStart = {
    x: ringLayout.centerXPct + ringLayout.xRadiusPct * Math.cos(-0.3),
    y: ringLayout.centerYPct + ringLayout.yRadiusPct * Math.sin(-0.3),
  };
  const arcEnd = {
    x: ringLayout.centerXPct + ringLayout.xRadiusPct * Math.cos(0.6),
    y: ringLayout.centerYPct + ringLayout.yRadiusPct * Math.sin(0.6),
  };

  return (
    <div className="yaniv-player-ring relative w-full">
      {/* SVG ring guide */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <marker
            id="ring-arrow"
            markerWidth="3"
            markerHeight="3"
            refX="2.5"
            refY="1.5"
            orient="auto"
          >
            <path d="M0,0 L0,3 L3,1.5 z" fill="currentColor" opacity="0.25" />
          </marker>
        </defs>
        {/* Dashed ring */}
        <ellipse
          cx={ringLayout.centerXPct}
          cy={ringLayout.centerYPct}
          rx={ringLayout.xRadiusPct}
          ry={ringLayout.yRadiusPct}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.4"
          strokeDasharray="2 2"
          opacity="0.15"
        />
        {/* Clockwise direction arc with arrowhead */}
        <path
          d={`M ${arcStart.x.toFixed(2)},${arcStart.y.toFixed(2)} A ${ringLayout.xRadiusPct},${ringLayout.yRadiusPct} 0 0,1 ${arcEnd.x.toFixed(2)},${arcEnd.y.toFixed(2)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.6"
          opacity="0.25"
          markerEnd="url(#ring-arrow)"
        />
      </svg>

      {/* Player seat nodes */}
      {seats.map(({ player, xPct, yPct, isActive, isNext }) => (
        <PlayerSeatNode
          key={player.id}
          player={player}
          isHuman={player.id === humanId}
          isActive={isActive}
          isNext={isNext}
          showTurnRing={isActive && turnTimerActive}
          turnProgress={turnProgress}
          turnSecondsLeft={turnSecondsLeft}
          idlePulses={idlePulses}
          badge={actionBadges[player.id]}
          scoreFeedback={scoreFeedback[player.id]}
          style={{
            position: "absolute",
            left: `calc(${xPct}% - 36px)`,
            top: `calc(${yPct}% - 40px)`,
          }}
        />
      ))}

      {/* Center: deck + discard */}
      <div
        className="absolute flex flex-col items-center gap-2"
        style={{
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
        }}
      >
        <div className="flex items-end gap-6">
          {/* Draw pile — face-down green stack you draw a blind card from. */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center min-h-[80px]">
              <DeckVisual count={deckCount} />
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Draw
              </span>
              <span className="text-[9px] text-muted-foreground/70 tabular-nums">
                {deckCount} left
              </span>
            </div>
          </div>

          {/* Discard pile — face-up; its top card is a key decision input, so it is
              rendered large and clearly distinct from the draw pile. */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center justify-center min-h-[80px]">
              {qdActive && qdWindow ? (
                <QuickDrawPile
                  cards={qdWindow.cards}
                  progress={qdProgress}
                  timeLeftMs={qdTimeLeft}
                  canSteal={qdPlayerCanSteal}
                  onSteal={onSteal}
                />
              ) : (
                <DiscardPileGroup
                  group={discardTopGroup}
                  canDraw={canDrawFromDiscard}
                  onPickCard={onPickDiscardCard}
                />
              )}
            </div>
            <div className="flex flex-col items-center leading-none">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {qdActive ? "Quick draw!" : "Discard"}
              </span>
              <span className="text-[9px] text-muted-foreground/70">
                {qdActive
                  ? "tap to steal"
                  : canDrawFromDiscard && discardTopGroup.length > 0
                  ? "← tap to draw"
                  : " "}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PlayerSeatNode ────────────────────────────────────────────────────────

function PlayerSeatNode({
  player,
  isHuman,
  isActive,
  isNext,
  showTurnRing,
  turnProgress,
  turnSecondsLeft,
  idlePulses,
  badge,
  scoreFeedback,
  style,
}: {
  player: YanivPlayer;
  isHuman: boolean;
  isActive: boolean;
  isNext: boolean;
  showTurnRing?: boolean;
  turnProgress?: number;
  turnSecondsLeft?: number | null;
  idlePulses: boolean;
  badge?: ActionBadge;
  scoreFeedback?: ScoreFeedback;
  style?: React.CSSProperties;
}) {
  const initials = player.name.slice(0, 2).toUpperCase();

  // Inactive (and not eliminated) seats are visibly dimmed so the active player
  // is unmistakable at any player count. The active seat scales up slightly.
  const seatOpacity = isActive ? 1 : player.eliminated ? 0.3 : 0.45;

  return (
    <div
      className="flex flex-col items-center gap-0.5 select-none transition-all duration-300"
      style={{
        width: 72,
        ...style,
        opacity: seatOpacity,
        transform: `${(style?.transform as string) ?? ""} scale(${isActive ? 1.08 : 1})`.trim(),
      }}
    >
      {/* Avatar */}
      <div className="relative flex items-center justify-center">
        <ContextTooltip
          text={
            showTurnRing
              ? "Active turn. The ring drains as time runs out; at zero, a safe discard is auto-played."
              : isNext
              ? "This player is next."
              : `${player.name}'s seat. The badge shows cards left in hand.`
          }
          className="rounded-full"
        >
          {/* Co-located turn countdown ring (time remaining this turn) */}
          {showTurnRing && (
            <TurnCountdownRing progress={turnProgress ?? 1} />
          )}
          <div
            className={`
              w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
              transition-all duration-300
              ${
                isActive
                  ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : isNext
                  ? "bg-muted text-foreground ring-1 ring-primary/40"
                  : player.eliminated
                  ? "bg-muted/30 text-muted-foreground/40"
                  : "bg-muted text-muted-foreground"
              }
            `}
            style={
              isActive && idlePulses
                ? { animation: "seat-glow-pulse 1.5s ease-in-out infinite" }
                : undefined
            }
          >
            {initials}
          </div>
        </ContextTooltip>

        {/* Numeric card-count badge — how many cards an opponent holds is a core Yaniv
            decision input, so it gets an explicit number rather than a fan to eyeball. */}
        {!player.eliminated && (
          <ContextTooltip
            text={`${player.name} has ${player.hand.length} card${player.hand.length === 1 ? "" : "s"} left.`}
            className="absolute -bottom-1.5 -right-1.5"
          >
            <div
              className="min-w-[20px] h-5 px-1 rounded-full
                bg-foreground text-background text-[11px] font-bold leading-none
                flex items-center justify-center ring-2 ring-background tabular-nums shadow-sm"
              aria-label={`${player.hand.length} card${player.hand.length === 1 ? "" : "s"} in hand`}
            >
              {player.hand.length}
            </div>
          </ContextTooltip>
        )}

        {/* Action badge */}
        {badge && (
          <div
            key={badge.key}
            className="absolute pointer-events-none"
            style={{
              bottom: "calc(100% + 2px)",
              left: "50%",
              animation: "badge-slide-up 2s ease-out forwards",
            }}
          >
            <span
              className={`
                text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap
                ${
                  badge.variant === "yaniv"
                    ? "bg-amber-500 text-white"
                    : badge.variant === "stolen"
                    ? "bg-destructive text-white"
                    : "bg-primary/90 text-primary-foreground"
                }
              `}
            >
              {badge.text}
            </span>
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={`text-[10px] font-medium text-center leading-tight max-w-[72px] truncate ${
          isActive ? "text-primary" : player.eliminated ? "text-muted-foreground/40 line-through" : "text-foreground"
        }`}
      >
        {player.name}
      </span>

      {/* Status label */}
      {isActive && (
        <span
          className="text-[9px] text-primary font-semibold tabular-nums"
          role={showTurnRing ? "timer" : undefined}
          aria-live={showTurnRing ? "off" : undefined}
        >
          ↑ turn
          {showTurnRing && turnSecondsLeft != null ? ` · ${turnSecondsLeft}s` : ""}
        </span>
      )}
      {!isActive && isNext && (
        <span className="text-[9px] text-muted-foreground">next</span>
      )}
      {!isActive && !isNext && isHuman && (
        <span className="text-[9px] text-muted-foreground/60">you</span>
      )}

      {/* Running score — the live card-count now lives in the badge on the avatar. */}
      <div
        className={`flex gap-1 text-[9px] tabular-nums ${
          player.eliminated ? "text-muted-foreground/40" : "text-muted-foreground"
        }`}
      >
        <span>{player.score} pts</span>
        {player.eliminated && <span className="text-destructive/70">· out</span>}
      </div>
    </div>
  );
}

// ── TurnCountdownRing ─────────────────────────────────────────────────────
// Thin ring co-located around the active avatar, depleting over the turn.
// Colour shifts turn-hue → amber → red as time runs low (colour as information).
function TurnCountdownRing({ progress }: { progress: number }) {
  const size = 52;
  const stroke = 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(1, progress)));
  const urgency = getTurnTimerUrgency(progress);
  const color =
    urgency === "normal"
      ? "var(--primary)"
      : urgency === "warning"
      ? "rgb(245 158 11)" // amber-500
      : "rgb(239 68 68)"; // red-500
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
        stroke="color-mix(in oklab, var(--primary) 18%, transparent)"
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

// ── QuickDrawPile ─────────────────────────────────────────────────────────

function QuickDrawPile({
  cards,
  progress,
  timeLeftMs,
  canSteal,
  onSteal,
}: {
  cards: { suit: string; rank: string }[];
  progress: number;
  timeLeftMs: number;
  canSteal: boolean;
  onSteal: () => void;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <ContextTooltip
      text={
        canSteal
          ? "Quick draw: steal this fresh discard before the timer empties."
          : "Quick draw window: another player may steal this fresh discard."
      }
      className="relative flex items-center gap-1"
    >
      {cards.map((card, i) => (
        <div
          key={i}
          className={`rounded-lg ring-2 ring-amber-400 shadow-lg shadow-amber-400/30 ${
            canSteal ? "animate-pulse cursor-pointer" : ""
          }`}
          onClick={canSteal ? onSteal : undefined}
          role={canSteal ? "button" : undefined}
          aria-label={canSteal ? "Steal from discard pile" : undefined}
        >
          <PlayingCard card={toShellCard(card)} size="sm" />
        </div>
      ))}
      <svg
        width={radius * 2 + 8}
        height={radius * 2 + 8}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-90deg)",
          pointerEvents: "none",
        }}
      >
        <circle
          cx={radius + 4}
          cy={radius + 4}
          r={radius}
          fill="none"
          stroke="rgba(251,191,36,0.2)"
          strokeWidth="3"
        />
        <circle
          cx={radius + 4}
          cy={radius + 4}
          r={radius}
          fill="none"
          stroke="rgb(251,191,36)"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
      </svg>
      <span
        className="absolute text-[10px] font-bold text-amber-300 tabular-nums pointer-events-none"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {formatQuickDrawTime(timeLeftMs)}
      </span>
      {canSteal && (
        <button
          onClick={onSteal}
          className="absolute inset-0 rounded-lg hover:bg-amber-400/10 transition-colors"
          aria-label="Steal discarded cards"
        />
      )}
    </ContextTooltip>
  );
}

// ── DiscardPileGroup ──────────────────────────────────────────────────────

function DiscardPileGroup({
  group,
  canDraw,
  onPickCard,
}: {
  group: { suit: string; rank: string }[];
  canDraw: boolean;
  onPickCard: (idx: number) => void;
}) {
  if (group.length === 0) {
    return (
      <div className="w-20 h-28 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/50 text-[10px]">
        empty
      </div>
    );
  }
  // A single discarded card gets the full large treatment (the key decision input);
  // a discarded set/run shows each card a notch smaller so the row still fits.
  const cardSize = group.length === 1 ? "lg" : "md";
  return (
    <div className="relative">
      {/* Offset backing cards convey that this is a stack of past discards. */}
      <div
        className="absolute rounded-lg bg-muted-foreground/15 border border-border"
        style={{ inset: 0, transform: "translate(5px, 5px)" }}
        aria-hidden
      />
      <div
        className="absolute rounded-lg bg-muted-foreground/10 border border-border"
        style={{ inset: 0, transform: "translate(2.5px, 2.5px)" }}
        aria-hidden
      />
      <ContextTooltip
        text={
          canDraw
            ? "You may take one visible discard card after playing a legal discard."
            : "The discard pile shows the newest visible card group."
        }
        className="relative"
      >
        <div className="relative flex gap-0.5">
          {group.map((card, i) => (
            <button
              key={i}
              onClick={() => canDraw && onPickCard(i)}
              disabled={!canDraw}
              className={`rounded-lg transition-all outline-none ${
                canDraw
                  ? "hover:-translate-y-1 cursor-pointer ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                  : "cursor-default"
              }`}
              aria-label={canDraw ? `Draw ${card.rank} of ${card.suit}` : `Top discard: ${card.rank} of ${card.suit}`}
            >
              <PlayingCard
                card={{ suit: card.suit as ShellCard["suit"], rank: card.rank as ShellCard["rank"], faceUp: true }}
                size={cardSize}
              />
            </button>
          ))}
        </div>
      </ContextTooltip>
    </div>
  );
}

// ── DeckVisual ────────────────────────────────────────────────────────────

function DeckVisual({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div
        className="w-20 h-28 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/50 text-[10px]"
        aria-label="empty draw deck"
      >
        empty
      </div>
    );
  }
  const layers = Math.min(count, 5);
  const topIndex = layers - 1;

  // Sized to roughly match the large discard card so the two piles read as a pair,
  // while the green face-down backs keep the draw pile unmistakably distinct.
  return (
    <ContextTooltip text={`Draw deck: ${count} unknown card${count === 1 ? "" : "s"} left.`}>
      <div
        className="relative w-20 h-28"
        aria-label={`draw deck with ${count} card${count === 1 ? "" : "s"} remaining`}
        role="img"
      >
        {Array.from({ length: layers }, (_, i) => {
          const isTop = i === topIndex;
          const depth = topIndex - i;
          return (
            <div
              key={i}
              className="pip-card-back absolute rounded-lg shadow-md"
              style={{
                width: 64,
                height: 90,
                top: 6 + depth * 3,
                left: 8 - depth * 4,
                zIndex: i,
                transform: `rotate(${depth * -2}deg)`,
              }}
            >
              {isTop && (
                <div className="w-full h-full flex items-center justify-center rounded-lg">
                  <div className="w-[80%] h-[80%] rounded border border-white/30" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ContextTooltip>
  );
}

// ── ContextTooltip ───────────────────────────────────────────────────────
// Hover on desktop, long-press on touch. Hints stay contextual so the table
// never needs an upfront tutorial gate.

function ContextTooltip({
  text,
  children,
  className = "",
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimers() {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    longPressTimerRef.current = null;
    hideTimerRef.current = null;
  }

  function show() {
    clearTimers();
    setVisible(true);
  }

  function hideSoon() {
    clearTimers();
    hideTimerRef.current = setTimeout(() => setVisible(false), 120);
  }

  function startLongPress(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse") return;
    clearTimers();
    longPressTimerRef.current = setTimeout(() => setVisible(true), 450);
  }

  function endLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (visible) {
      hideTimerRef.current = setTimeout(() => setVisible(false), 1400);
    }
  }

  useEffect(() => {
    return clearTimers;
  }, []);

  return (
    <div
      className={`relative inline-flex min-w-0 ${className}`}
      aria-describedby={visible ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onFocus={show}
      onBlur={hideSoon}
      onPointerDown={startLongPress}
      onPointerUp={endLongPress}
      onPointerCancel={endLongPress}
    >
      {children}
      {visible && (
        <div
          id={id}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[min(16rem,80vw)] -translate-x-1/2 rounded-md border border-white/15 bg-popover px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-popover-foreground shadow-xl"
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ── SettingRow ────────────────────────────────────────────────────────────

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-foreground text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

// ── RoundEndOverlay ───────────────────────────────────────────────────────

function RoundEndOverlay({
  state,
  playerId,
  onNextRound,
  onChangeGame,
}: {
  state: YanivGameState;
  playerId: string;
  onNextRound: () => void;
  onChangeGame: () => void;
}) {
  const result = state.roundResult!;
  const scoreboardRows = getYanivScoreboardRows(state);
  const callerName = state.players.find((p) => p.id === result.callerId)?.name ?? "Someone";
  const callerIsPlayer = result.callerId === playerId;

  let headline: string;
  if (result.assaf) {
    headline = callerIsPlayer ? "Assaf! You got penalty points" : `Assaf! ${callerName} got +30`;
  } else {
    headline = callerIsPlayer ? "Yaniv! You win this round" : `${callerName} called Yaniv`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-card border border-border p-5 shadow-2xl flex flex-col gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-card-foreground">{headline}</p>
          <p className="text-sm text-muted-foreground mt-1">Round {state.round} complete</p>
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80">
          <div className="grid grid-cols-[minmax(0,1.2fr)_4.2rem_4rem_4.5rem] items-center gap-2 bg-muted/50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Player</span>
            <span className="text-right">Hand</span>
            <span className="text-right">Round</span>
            <span className="text-right">Total</span>
          </div>
          <div className="divide-y divide-border/70">
            {scoreboardRows.map((row) => {
              const player = state.players.find((p) => p.id === row.id);
              if (!player) return null;

              return <RoundScoreboardRow key={row.id} row={row} player={player} />;
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={onNextRound} className="w-full h-11 font-semibold">
            Next Round
          </Button>
          <Button
            onClick={onChangeGame}
            variant="ghost"
            className="w-full h-10 text-muted-foreground hover:text-foreground"
          >
            Change Game
          </Button>
        </div>
      </div>
    </div>
  );
}

function RoundScoreboardRow({
  row,
  player,
}: {
  row: YanivScoreboardRow;
  player: YanivPlayer;
}) {
  const thresholdClasses = {
    safe: "text-foreground",
    warning: "text-amber-300",
    busted: "text-destructive",
  }[row.thresholdState];

  const statusLabel =
    row.thresholdState === "busted"
      ? "busted"
      : row.thresholdState === "warning"
        ? "near bust"
        : null;

  return (
    <div
      className={`grid grid-cols-[minmax(0,1.2fr)_4.2rem_4rem_4.5rem] items-center gap-2 px-3 py-2.5 ${
        row.thresholdState === "warning"
          ? "bg-amber-400/10"
          : row.thresholdState === "busted"
            ? "bg-destructive/10"
            : "bg-card"
      }`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-card-foreground">{row.name}</span>
          {statusLabel && (
            <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${thresholdClasses}`}>
              {statusLabel}
            </span>
          )}
        </div>
        <div className="mt-1 flex min-h-8 flex-wrap gap-1">
          {player.hand.map((card, i) => (
            <PlayingCard key={i} card={toShellCard(card)} size="sm" />
          ))}
        </div>
      </div>
      <span className="text-right text-sm font-semibold tabular-nums text-muted-foreground">
        {row.handTotal}
      </span>
      <span
        className={`text-right text-sm font-bold tabular-nums ${
          row.roundDelta > 0
            ? "text-amber-300"
            : row.roundDelta < 0
              ? "text-emerald-300"
              : "text-muted-foreground"
        }`}
        style={{ animation: "score-delta-pop 700ms ease-out both" }}
      >
        {row.roundDelta > 0 ? `+${row.roundDelta}` : row.roundDelta}
      </span>
      <span className={`text-right text-xl font-bold tabular-nums ${thresholdClasses}`}>
        {row.cumulativeScore}
      </span>
    </div>
  );
}

// ── SelectionSummary ──────────────────────────────────────────────────────
// Running, pre-commit feedback: what's selected, the combo name, its point
// value, and whether it's a legal discard — shown live before the player commits.

function SelectionSummary({
  cards,
  selection,
}: {
  cards: { suit: string; rank: string }[];
  selection: SelectionDescription;
}) {
  const legal = selection.valid;

  return (
    <div
      className={`rounded-lg border px-3 py-2 transition-colors ${
        legal
          ? "border-primary/50 bg-primary/10"
          : "border-destructive/50 bg-destructive/10"
      }`}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {cards.map((c, i) => (
            <span
              key={i}
              className={`inline-flex items-center rounded-md bg-card border border-border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                c.suit === "hearts" || c.suit === "diamonds"
                  ? "text-red-500"
                  : "text-foreground"
              }`}
            >
              {c.rank}
              {suitSymbol(c.suit)}
            </span>
          ))}
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
          {selection.points} pts
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
        <span aria-hidden className={legal ? "text-primary" : "text-destructive"}>
          {legal ? "✓" : "✗"}
        </span>
        <span className={legal ? "text-foreground" : "text-destructive"}>
          {legal ? selection.label : "Not a legal discard"}
        </span>
        {legal && (
          <span className="text-muted-foreground">— ready to discard</span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function suitSymbol(suit: string): string {
  return SUIT_SYMBOLS[suit] ?? suit;
}
