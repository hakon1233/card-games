"use client";

// One Yaniv game at the table: the game state, your moves, the bots' answers, the Quick Draw
// window's clock and steals, the turn clock's safe discard, and your rounds won and lost.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnimationSpeed } from "@/lib/animation-preferences";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import { playBotTurns } from "@/lib/games/bot-turns";
import {
  deal,
  apply,
  activePlayer,
  timeoutMove,
  type YanivAction,
  type YanivGameState,
  type YanivSettings,
} from "@/lib/games/yaniv";
import { useYanivFeedback } from "./feedback";
import { getTurnClockKey } from "./turn-clock";

export const PLAYER_ID = "player-1";
export const QUICK_DRAW_MS = 2000;
const bot = new YanivBot();
const botFor = (playerId: string) => (playerId === PLAYER_ID ? undefined : bot);
const yanivRules = { apply, activePlayer };

function buildPlayerDefs(numBots: number) {
  const defs: { id: string; name: string; isBot: boolean }[] = [
    { id: PLAYER_ID, name: "You", isBot: false },
  ];
  for (let i = 1; i <= numBots; i++) {
    defs.push({ id: `bot-${i}`, name: `Bot ${i}`, isBot: true });
  }
  return defs;
}

export function useYanivSession(animationSpeed: AnimationSpeed, nextUpPreview: boolean) {
  const [gameState, setGameState] = useState<YanivGameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [roundsWon, setRoundsWon] = useState(0);
  const [roundsLost, setRoundsLost] = useState(0);
  const [qdTimeLeft, setQdTimeLeft] = useState<number | null>(null);

  const gameStateRef = useRef<YanivGameState | null>(null);
  const turnClockGenerationRef = useRef(0);

  const feedback = useYanivFeedback(gameState, animationSpeed, nextUpPreview);
  const { resetGame } = feedback;

  const qdWindowKey = gameState?.quickDrawWindow
    ? `${gameState.quickDrawWindow.discarderId}:${gameState.discardPile.length}`
    : null;

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  function dispatch(state: YanivGameState, triggerAction?: YanivAction, previousState?: YanivGameState) {
    // Invalidate this clock synchronously. React cleans up effects
    // after the state transition, so an expiring interval can otherwise tick
    // once more and apply its 0s result to the next human turn.
    turnClockGenerationRef.current += 1;
    if (triggerAction) {
      feedback.onMove(triggerAction, previousState ?? state, state);
    }

    const s = playBotTurns(yanivRules, state, botFor, feedback.onMove);
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

  // playBotTurns stops after MAX_BOT_TURNS moves. Once you are eliminated a round is bots only
  // and can run longer than that, so whenever a bot still has the move, play on.
  useEffect(() => {
    const active = gameState && activePlayer(gameState);
    if (!gameState || !active || !botFor(active)) return;
    const timeout = setTimeout(() => dispatch(gameState), 0);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]);

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
    const action = s && timeoutMove(s, PLAYER_ID);
    if (!s || !action) return;
    dispatch(apply(s, action), action, s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The countdown itself (its interval, the low-time cue, calling autoPlayTurnTimeout at
  // zero) runs in <TurnClock>, so its 10Hz tick re-renders only the ring.

  function start(table: YanivSettings & { numBots: number }) {
    const { yanivThreshold, scoreLimit, quickDraw, numBots } = table;
    const rules: YanivSettings = { yanivThreshold, scoreLimit, quickDraw };
    setRoundsWon(0);
    setRoundsLost(0);
    resetGame();
    // Through dispatch, so a round a bot ends on its opening moves is counted too.
    dispatch(deal(`game-${Date.now()}`, buildPlayerDefs(numBots), rules));
  }

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
    feedback.resetRound();
    dispatch(apply(gameState, { type: "NEXT_ROUND", playerId: PLAYER_ID }));
  }

  function toggleCard(idx: number) {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  return {
    gameState,
    selected,
    roundsWon,
    roundsLost,
    qdTimeLeft,
    feedback,
    turnKey,
    turnClockGenerationRef,
    autoPlayTurnTimeout,
    start,
    callYaniv,
    discardAndDraw,
    stealFromDiscard,
    nextRound,
    toggleCard,
  };
}
