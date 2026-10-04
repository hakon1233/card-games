"use client";

import { useId, useState } from "react";
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
import { isPlayable, topCard, effectiveSuit, playableCards } from "@/lib/games/crazy-eights";
import { HUMAN_PLAYER_ID } from "@/lib/games/engine";
import { toShellCard } from "@/lib/games/shell-types";
import { botName, useCrazyEightsSession } from "./session";
import { CrazyEightsSettingsScreen } from "./settings";
import { OpponentSeat, Piles, SuitPicker } from "./table";

const PLAYER_NAME = "You";

export default function CrazyEightsPage() {
  const router = useRouter();
  const statusId = useId();

  const [numBots, setNumBots] = useState(1);
  const [animationSpeed, setAnimationSpeed] = useAnimationSpeed();
  const [cardDeck, setCardDeck] = useCardDeck();
  const { gameState, wins, losses, pendingEight, start, play, draw, cancelEight } =
    useCrazyEightsSession(animationSpeed);
  const startGame = () => start(numBots);

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
            onDraw={draw}
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
              onCardClick={(_, i) => play(i)}
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
                  onClick={draw}
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
          onPick={(suit) => play(pendingEight, suit)}
          onCancel={cancelEight}
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
