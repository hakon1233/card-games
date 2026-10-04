"use client";

// One Crazy Eights game at the table: the game state, your plays and draws, the eight waiting
// for its suit, the bots' answers at a watchable pace, and your rounds won and lost.

import { useCallback, useEffect, useRef, useState } from "react";
import { scaleAnimationDuration, type AnimationSpeed } from "@/lib/animation-preferences";
import { CrazyEightsBot } from "@/lib/bots/crazy-eights-bot";
import { botTurn } from "@/lib/games/bot-turns";
import {
  deal,
  apply,
  activePlayer,
  isPlayable,
  type CrazyEightsState,
} from "@/lib/games/crazy-eights";
import { HUMAN_PLAYER_ID } from "@/lib/games/engine";
import type { Suit } from "@/lib/games/types";

// Base pause between bot moves so plays are watchable; scaled by the
// animation-speed preference (reduced collapses it to near-instant).
const BOT_TURN_MS = 850;
const bot = new CrazyEightsBot();
const botFor = (playerId: string) => (playerId === HUMAN_PLAYER_ID ? undefined : bot);

function buildPlayerDefs(numBots: number): { id: string; isBot: boolean }[] {
  const defs = [{ id: HUMAN_PLAYER_ID, isBot: false }];
  for (let i = 1; i <= numBots; i++) {
    defs.push({ id: `bot-${i}`, isBot: true });
  }
  return defs;
}

// Drawing is always legal on your turn, so a bot move the rules reject falls back to a draw.
const crazyEightsRules = {
  apply,
  activePlayer,
  fallbackMove: (_: unknown, playerId: string) => ({ type: "DRAW_CARD" as const, playerId }),
};

export function botName(id: string): string {
  const match = /^bot-(\d+)$/.exec(id);
  return match ? `Bot ${match[1]}` : id;
}

export function useCrazyEightsSession(animationSpeed: AnimationSpeed) {
  const [gameState, setGameState] = useState<CrazyEightsState | null>(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [pendingEight, setPendingEight] = useState<number | null>(null);

  const gameStateRef = useRef<CrazyEightsState | null>(null);
  const resultRecordedRef = useRef(false);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // Single funnel for every state transition. Records the round result into the
  // session tally exactly once, at the moment the round ends — so recording
  // never happens synchronously inside an effect body (cascading-render lint).
  const commitState = useCallback((next: CrazyEightsState) => {
    setGameState(next);
    if (next.status === "round_over" && next.winnerId && !resultRecordedRef.current) {
      resultRecordedRef.current = true;
      if (next.winnerId === HUMAN_PLAYER_ID) setWins((w) => w + 1);
      else setLosses((l) => l + 1);
    }
  }, []);

  // ── Bot turn driver ───────────────────────────────────────────────────────
  // After every state change, if the active seat is a bot, show its move after
  // a pause. The new state re-runs this effect and steps the next bot — so a
  // chain of bots resolves one visible move at a time. Any other state change
  // first cancels the pending move.
  useEffect(() => {
    const turn = gameState && botTurn(crazyEightsRules, gameState, botFor);
    if (!turn) return;
    const delay = scaleAnimationDuration(BOT_TURN_MS, animationSpeed);
    const timer = setTimeout(() => commitState(turn.next), delay);
    return () => clearTimeout(timer);
  }, [gameState, animationSpeed, commitState]);

  const start = useCallback((numBots: number) => {
    const defs = buildPlayerDefs(numBots);
    resultRecordedRef.current = false;
    setPendingEight(null);
    setGameState(
      deal(
        `crazy-eights-${Date.now()}`,
        defs.map((d) => d.id),
        defs.map((d) => d.isBot),
      ),
    );
  }, []);

  /** Play the card at `index`; an eight without a suit waits in `pendingEight` for one. */
  const play = useCallback((index: number, declaredSuit?: Suit) => {
    const s = gameStateRef.current;
    if (!s) return;
    if (s.players[s.currentPlayerIndex]?.id !== HUMAN_PLAYER_ID) return;
    const human = s.players.find((p) => p.id === HUMAN_PLAYER_ID);
    const card = human?.hand[index];
    if (!card || !isPlayable(card, s)) return;
    if (card.rank === "8" && !declaredSuit) {
      setPendingEight(index);
      return;
    }
    setPendingEight(null);
    commitState(apply(s, { type: "PLAY_CARD", playerId: HUMAN_PLAYER_ID, cardIndex: index, declaredSuit }));
  }, [commitState]);

  const draw = useCallback(() => {
    const s = gameStateRef.current;
    if (!s) return;
    if (s.players[s.currentPlayerIndex]?.id !== HUMAN_PLAYER_ID) return;
    commitState(apply(s, { type: "DRAW_CARD", playerId: HUMAN_PLAYER_ID }));
  }, [commitState]);

  const cancelEight = useCallback(() => setPendingEight(null), []);

  return { gameState, wins, losses, pendingEight, start, play, draw, cancelEight };
}
