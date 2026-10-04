"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
import { TableDisplaySettings } from "@/components/game/table-display-settings";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { CardHand } from "@/components/game/card-hand";
import { scaleAnimationDuration } from "@/lib/animation-preferences";
import {
  deal,
  apply,
  activePlayer,
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
} from "@/lib/games/yaniv";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import { playBotTurns } from "@/lib/games/bot-turns";
import { buildYanivScoreCascade, type YanivFeedbackTone } from "@/lib/games/yaniv-feedback";
import { formatQuickDrawTime } from "@/lib/games/quick-draw-ui";
import { getYanivHandReadout } from "@/lib/games/yaniv-readout";
import { getTurnPreviewName } from "@/lib/games/yaniv-turn-preview";
import { getTurnClockKey } from "@/lib/games/turn-clock";
import { toShellCard } from "@/lib/games/shell-types";
import { ContextTooltip } from "./context-tooltip";
import {
  PlayerRing,
  useYanivTableFormFactor,
  type ActionBadge,
  type ScoreFeedback,
} from "./player-ring";
import { RoundEndOverlay } from "./round-end";
import { SelectionSummary, suitSymbol } from "./selection-summary";
import { TurnCountdown } from "./turn-clock";

const PLAYER_ID = "player-1";
const SETTINGS_KEY = "yaniv-settings";
const QUICK_DRAW_MS = 2000;
const TURN_PREVIEW_MS = 1400;
const bot = new YanivBot();
const botFor = (playerId: string) => (playerId === PLAYER_ID ? undefined : bot);
const yanivRules = { apply, activePlayer };

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

function getNextActiveIdx(players: YanivPlayer[], currentIdx: number): number {
  const N = players.length;
  for (let step = 1; step < N; step++) {
    const idx = (currentIdx + step) % N;
    if (!players[idx].eliminated) return idx;
  }
  return -1;
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
  const turnClockGenerationRef = useRef(0);
  const scoreFeedbackTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const previousTurnPlayerIdRef = useRef<string | null>(null);
  const turnPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [numBots, setNumBots] = useState(1);
  const [yanivThreshold, setYanivThreshold] = useState(DEFAULT_YANIV_SETTINGS.yanivThreshold);
  const [scoreLimit, setScoreLimit] = useState(DEFAULT_YANIV_SETTINGS.scoreLimit);
  const [quickDraw, setQuickDraw] = useState(DEFAULT_YANIV_SETTINGS.quickDraw);
  const [lowTimeSound, setLowTimeSound] = useState(DEFAULT_LOCAL_SETTINGS.lowTimeSound);
  const [idlePulses, setIdlePulses] = useState(DEFAULT_LOCAL_SETTINGS.idlePulses);
  const [nextUpPreview, setNextUpPreview] = useState(DEFAULT_LOCAL_SETTINGS.nextUpPreview);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [qdTimeLeft, setQdTimeLeft] = useState<number | null>(null);
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
    // BUG-GAM-76: invalidate this clock synchronously. React cleans up effects
    // after the state transition, so an expiring interval can otherwise tick
    // once more and apply its 0s result to the next human turn.
    turnClockGenerationRef.current += 1;
    if (triggerAction) {
      applyActionFeedback(triggerAction, previousState ?? state, state);
    }

    const s = playBotTurns(yanivRules, state, botFor, applyActionFeedback);
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
    if (gameState || typeof window === "undefined") return;
    const qaGameId = new URLSearchParams(window.location.search).get("qaGameId");
    if (!qaGameId) return;

    let cancelled = false;
    fetch(`/api/yaniv/${qaGameId}/action`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`QA fixture load failed: ${res.status}`))))
      .then(({ state }) => {
        if (cancelled) return;
        setGameState(state);
        setSelected([]);
        setRoundsWon(0);
        setRoundsLost(0);
        setActionBadges({});
        clearScoreFeedbackTimers();
        setScoreFeedback({});
        setRoundOverlayReady(true);
        previousTurnPlayerIdRef.current = null;
        setTurnPreview(null);
      })
      .catch((error) => console.error(error));

    return () => {
      cancelled = true;
    };
  }, [gameState]);

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
          dispatch(apply(s, { type: "QUICK_DRAW_EXPIRE" }), { type: "QUICK_DRAW_EXPIRE" }, s);
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
      dispatch(apply(s, action), action, s);
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
    dispatch(apply(s, action), action, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The per-turn countdown interval, low-time cue, and auto-play-on-expiry now
  // live in <TurnCountdown> (rendered below) so a 10Hz tick no longer re-renders
  // this whole component — see CAR-182. `turnKey`/`autoPlayTurnTimeout` are
  // forwarded to it unchanged.

  const startGame = useCallback(() => {
    const settings: YanivSettings = { yanivThreshold, scoreLimit, quickDraw };
    saveSettings({ ...settings, numBots, lowTimeSound, idlePulses, nextUpPreview });
    const initial = deal(`game-${Date.now()}`, buildPlayerDefs(numBots), settings);
    setGameState(playBotTurns(yanivRules, initial, botFor));
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
    dispatch(apply(gameState, action), action, gameState);
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
    dispatch(apply(gameState, action), action, gameState);
  }

  function stealFromDiscard() {
    if (!gameState?.quickDrawWindow) return;
    const action = { type: "QUICK_DRAW_STEAL" as const, playerId: PLAYER_ID };
    dispatch(apply(gameState, action), action, gameState);
  }

  function nextRound() {
    if (!gameState) return;
    const s = playBotTurns(yanivRules, apply(gameState, { type: "NEXT_ROUND", playerId: PLAYER_ID }), botFor);
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
              <ToggleSwitch label="Quick Draw" checked={quickDraw} onChange={setQuickDraw} />
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
                <ToggleSwitch label="Low-Time Sound" checked={lowTimeSound} onChange={setLowTimeSound} />
              </SettingRow>

              <SettingRow label="Idle Pulses">
                <ToggleSwitch label="Idle Pulses" checked={idlePulses} onChange={setIdlePulses} />
              </SettingRow>

              <SettingRow label="Next-Up Preview">
                <ToggleSwitch label="Next-Up Preview" checked={nextUpPreview} onChange={setNextUpPreview} />
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
  const turnTimerActive = turnKey !== null;

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
        {!isRoundOver && !isGameOver && (
          <TableDisplaySettings
            animationSpeed={animationSpeed}
            onAnimationSpeedChange={setAnimationSpeed}
            cardDeck={cardDeck}
            onCardDeckChange={setCardDeck}
          />
        )}

        {/* Circular player ring. Wrapped in <TurnCountdown> so the per-turn
            10Hz tick re-renders only the countdown ring + seconds readout via
            context, never PlayerRing itself (CAR-182). */}
        <TurnCountdown
          turnKey={turnKey}
          lowTimeSound={lowTimeSound}
          turnClockGenerationRef={turnClockGenerationRef}
          onExpire={autoPlayTurnTimeout}
        >
          <PlayerRing
            players={gameState.players}
            humanId={PLAYER_ID}
            currentPlayerIndex={gameState.currentPlayerIndex}
            nextPlayerIndex={nextPlayerIdx}
            turnTimerActive={turnTimerActive}
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
        </TurnCountdown>

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
              <ContextTooltip
                text="End the round now. If another player has an equal or lower hand, you take the Assaf penalty."
                className="w-full"
              >
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
                className="flex-1 min-w-0"
              >
                <Button
                  onClick={() => discardAndDraw(false)}
                  disabled={!canDiscard}
                  className="w-full whitespace-normal text-center leading-tight py-2"
                  variant="default"
                >
                  Discard &amp; Draw from Deck
                </Button>
              </ContextTooltip>
              <ContextTooltip
                text="Discard your selected legal set, then take one visible card from the top discard group."
                className="flex-1 min-w-0"
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


// ── SettingRow ────────────────────────────────────────────────────────────

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-foreground text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

// ── ToggleSwitch ──────────────────────────────────────────────────────────
// On/off switch with an accessible name. The `label` is applied as
// `aria-label` so screen readers announce e.g. "Quick Draw, switch, on"
// instead of a bare "switch" (WCAG 2.1 SC 4.1.2).

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-input"
      }`}
      role="switch"
      aria-checked={checked}
      aria-label={label}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
