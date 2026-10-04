"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { CardHand } from "@/components/game/card-hand";
import { EndGameScreen } from "@/components/game/end-game-screen";
import {
  AnimationPreferencesControl,
  useAnimationSpeed,
} from "@/components/game/animation-preferences-control";
import { CardDeckControl, useCardDeck } from "@/components/game/card-deck-control";
import { scaleAnimationDuration } from "@/lib/animation-preferences";
import {
  deal,
  apply,
  activePlayer,
  isPlayable,
  topCard,
  effectiveSuit,
  playableCards,
  type CrazyEightsState,
} from "@/lib/games/crazy-eights";
import { CrazyEightsBot } from "@/lib/bots/crazy-eights-bot";
import { botTurn } from "@/lib/games/bot-turns";
import { HUMAN_PLAYER_ID } from "@/lib/games/engine";
import type { Suit } from "@/lib/games/types";
import { toShellCard } from "@/lib/games/shell-types";
import { CrazyEightsSettingsScreen } from "./settings";
import { OpponentSeat, Piles, SuitPicker } from "./table";

const PLAYER_NAME = "You";
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

function botName(id: string): string {
  const match = /^bot-(\d+)$/.exec(id);
  return match ? `Bot ${match[1]}` : id;
}

export default function CrazyEightsPage() {
  const router = useRouter();
  const statusId = useId();

  const [numBots, setNumBots] = useState(1);
  const [gameState, setGameState] = useState<CrazyEightsState | null>(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [pendingEight, setPendingEight] = useState<number | null>(null);

  const [animationSpeed, setAnimationSpeed] = useAnimationSpeed();
  const [cardDeck, setCardDeck] = useCardDeck();

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
    const turn = gameState && botTurn({ apply, activePlayer }, gameState, botFor);
    if (!turn) return;
    const delay = scaleAnimationDuration(BOT_TURN_MS, animationSpeed);
    const timer = setTimeout(() => commitState(turn.next), delay);
    return () => clearTimeout(timer);
  }, [gameState, animationSpeed, commitState]);

  const startGame = useCallback(() => {
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
  }, [numBots]);

  const humanPlay = useCallback((index: number, declaredSuit?: Suit) => {
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

  const humanDraw = useCallback(() => {
    const s = gameStateRef.current;
    if (!s) return;
    if (s.players[s.currentPlayerIndex]?.id !== HUMAN_PLAYER_ID) return;
    commitState(apply(s, { type: "DRAW_CARD", playerId: HUMAN_PLAYER_ID }));
  }, [commitState]);

  // ── Settings / pre-game screen ────────────────────────────────────────────
  if (!gameState) {
    return (
      <CrazyEightsSettingsScreen
        numBots={numBots}
        onNumBotsChange={setNumBots}
        animationSpeed={animationSpeed}
        onAnimationSpeedChange={setAnimationSpeed}
        cardDeck={cardDeck}
        onCardDeckChange={setCardDeck}
        onStart={startGame}
      />
    );
  }

  // ── In-game derived view ──────────────────────────────────────────────────
  const human = gameState.players.find((p) => p.id === HUMAN_PLAYER_ID)!;
  const opponents = gameState.players.filter((p) => p.id !== HUMAN_PLAYER_ID);
  const activeSeat = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = gameState.status === "in_progress" && activeSeat?.id === HUMAN_PLAYER_ID;
  const isBotTurn = gameState.status === "in_progress" && !!activeSeat?.isBot;
  const isRoundOver = gameState.status === "round_over";

  const discardTop = topCard(gameState);
  const matchSuit = effectiveSuit(gameState);
  const declaredActive = gameState.declaredSuit !== null;
  const hasPlayable = playableCards(human.hand, gameState).length > 0;

  // Plain (non-hook) computation — must stay below the early return so no hook
  // is called conditionally. The hand is tiny, so this is cheap each render.
  const playableSet = new Set<number>();
  human.hand.forEach((card, i) => {
    if (isPlayable(card, gameState)) playableSet.add(i);
  });

  const winnerName =
    gameState.winnerId === HUMAN_PLAYER_ID
      ? PLAYER_NAME
      : gameState.winnerId
        ? botName(gameState.winnerId)
        : undefined;

  const statusMessage = isMyTurn
    ? hasPlayable
      ? "Your turn — play a card or draw."
      : "Your turn — no playable card, draw one."
    : isBotTurn
      ? `${botName(activeSeat?.id ?? "")} is thinking…`
      : isRoundOver
        ? gameState.winnerId === HUMAN_PLAYER_ID
          ? "You win the round!"
          : `${winnerName ?? "A bot"} wins the round.`
        : "";

  const disabledIndices = human.hand
    .map((_, i) => i)
    .filter((i) => !(isMyTurn && playableSet.has(i)));

  return (
    <div className="dark flex min-h-screen flex-col bg-[var(--pip-ink)] text-foreground">
      <BrandHeader title="Crazy Eights" tone="red" backLabel="Back" />

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 p-3 md:p-5">
        <div className="ml-auto flex w-full max-w-xs flex-col gap-2">
          <AnimationPreferencesControl value={animationSpeed} onChange={setAnimationSpeed} />
          <CardDeckControl value={cardDeck} onChange={setCardDeck} />
        </div>

        <p id={statusId} className="sr-only" role="status" aria-live="polite">
          {statusMessage}
        </p>

        <div className="pip-table-surface pip-table-rail flex flex-1 flex-col gap-4 rounded-3xl p-4 md:p-6">
          {/* Opponents */}
          <div className="flex flex-wrap items-start justify-center gap-3">
            {opponents.map((seat) => (
              <OpponentSeat
                key={seat.id}
                name={botName(seat.id)}
                cardCount={seat.hand.length}
                isActive={gameState.status === "in_progress" && activeSeat?.id === seat.id}
              />
            ))}
          </div>

          <Piles
            drawCount={gameState.deck.length}
            canDraw={isMyTurn}
            onDraw={humanDraw}
            discardTop={discardTop}
            matchSuit={matchSuit}
            declared={declaredActive}
          />

          {/* Human hand + actions */}
          <div className="pip-seat-panel rounded-xl bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-foreground">
                {PLAYER_NAME}
                {isMyTurn && <span className="ml-2 text-xs text-primary">— your turn</span>}
              </span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {human.hand.length} card{human.hand.length === 1 ? "" : "s"}
              </span>
            </div>

            <CardHand
              cards={human.hand.map((card) => toShellCard(card))}
              gameType="crazy_eights"
              selectedIndices={[]}
              disabledIndices={disabledIndices}
              onCardClick={(_, i) => humanPlay(i)}
              cardClassName={(_, i) => {
                if (!isMyTurn) return "cursor-default";
                return playableSet.has(i)
                  ? "cursor-pointer hover:-translate-y-1 card-selected-glow"
                  : "cursor-not-allowed opacity-40";
              }}
            />

            <div className="mt-3 flex flex-col gap-2">
              <p className="min-h-[1rem] text-center text-xs text-muted-foreground" aria-hidden="true">
                {statusMessage}
              </p>
              {isMyTurn && (
                <Button
                  onClick={humanDraw}
                  variant={hasPlayable ? "outline" : "default"}
                  className="w-full"
                >
                  {gameState.deck.length === 0 ? "Draw a card (reshuffle)" : "Draw a card"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Suit picker for an eight */}
      {pendingEight !== null && (
        <SuitPicker
          onPick={(suit) => humanPlay(pendingEight, suit)}
          onCancel={() => setPendingEight(null)}
        />
      )}

      {/* Round over */}
      {isRoundOver && (
        <EndGameScreen
          headline={gameState.winnerId === HUMAN_PLAYER_ID ? "You Win!" : "Round Over"}
          subline={
            gameState.winnerId === HUMAN_PLAYER_ID
              ? "You emptied your hand first."
              : `${winnerName ?? "A bot"} emptied their hand first.`
          }
          winnerName={winnerName}
          sessionRows={[
            { label: "Wins", value: wins },
            { label: "Losses", value: losses },
          ]}
          finalScoreRows={gameState.players.map((p) => ({
            label: p.id === HUMAN_PLAYER_ID ? PLAYER_NAME : botName(p.id),
            value: `${p.hand.length} card${p.hand.length === 1 ? "" : "s"} left`,
          }))}
          onPlayAgain={startGame}
          onChangeGame={() => router.push("/")}
        />
      )}
    </div>
  );
}
