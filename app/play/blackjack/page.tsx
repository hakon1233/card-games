"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { GameShell } from "@/components/game/shell";
import { ScoreDisplay } from "@/components/game/score-display";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { Button } from "@/components/ui/button";
import { dealInitialState, applyAction, handValue, isBlackjack } from "@/lib/games/blackjack";
import { blackjackToShell, type BlackjackSession } from "@/lib/games/blackjack-to-shell";
import type { GameState } from "@/lib/games/types";

const PLAYER_ID = "player-1";
const PLAYER_NAME = "You";

function blackjackHeadline(state: GameState): { headline: string; subline?: string } {
  switch (state.status) {
    case "player_bust":
      return { headline: "Dealer Wins", subline: "You busted" };
    case "dealer_bust":
      return { headline: "You Win!", subline: "Dealer busted" };
    case "player_win":
      return {
        headline: "You Win!",
        subline: isBlackjack(state.playerHand.cards) ? "Blackjack!" : undefined,
      };
    case "dealer_win":
      return { headline: "Dealer Wins" };
    case "push":
      return { headline: "Push — Tie" };
    default:
      return { headline: "" };
  }
}

// Screen-reader cue that LEADS with the current turn/result so assistive tech
// announces the outcome (not a stale visual state) after deal, hit, stand, bust,
// dealer result, and rematch. Mirrors the Go Fish GAM-117 pattern (GAM-122).
function blackjackLiveCue(state: GameState, playerValue: number | null): string {
  switch (state.status) {
    case "player_bust":
      return "Bust — dealer wins. You went over 21.";
    case "dealer_bust":
      return "You win — dealer busted.";
    case "player_win":
      return isBlackjack(state.playerHand.cards) ? "Blackjack — you win!" : "You win.";
    case "dealer_win":
      return "Dealer wins.";
    case "push":
      return "Push — tie.";
    default:
      return playerValue !== null
        ? `Your turn — hit or stand. Your hand totals ${playerValue}.`
        : "Your turn — hit or stand.";
  }
}

export default function BlackjackPage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [session, setSession] = useState<BlackjackSession>({ wins: 0, losses: 0, pushes: 0 });

  const startGame = useCallback(() => {
    setGameState(dealInitialState(`game-${Date.now()}`, PLAYER_ID));
  }, []);

  const recordResult = useCallback((result: GameState["result"]) => {
    setSession((s) => ({
      wins: s.wins + (result === "player_win" ? 1 : 0),
      losses: s.losses + (result === "dealer_win" ? 1 : 0),
      pushes: s.pushes + (result === "push" ? 1 : 0),
    }));
  }, []);

  const hit = useCallback(() => {
    if (!gameState) return;
    const next = applyAction(gameState, { type: "HIT", playerId: PLAYER_ID });
    setGameState(next);
    if (next.turn === "over") recordResult(next.result);
  }, [gameState, recordResult]);

  const stand = useCallback(() => {
    if (!gameState) return;
    const next = applyAction(gameState, { type: "STAND", playerId: PLAYER_ID });
    setGameState(next);
    recordResult(next.result);
  }, [gameState, recordResult]);

  const shellState = blackjackToShell(gameState, PLAYER_NAME, session);
  const isPlayerTurn = gameState?.turn === "player";
  const isOver = gameState?.turn === "over";
  const playerValue = gameState ? handValue(gameState.playerHand.cards) : null;
  const dealerVisible = gameState ? gameState.dealerHand.filter((c) => !c.hidden) : [];
  const dealerValue = dealerVisible.length ? handValue(dealerVisible) : null;

  const actionArea = (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {playerValue !== null && (
          <span>
            Your hand: <span className="font-semibold text-foreground">{playerValue}</span>
          </span>
        )}
        {dealerValue !== null && (
          <span>
            Dealer showing: <span className="font-semibold text-foreground">{dealerValue}</span>
          </span>
        )}
      </div>
      <ScoreDisplay
        scores={[
          { label: "Wins", value: session.wins },
          { label: "Losses", value: session.losses },
          { label: "Pushes", value: session.pushes },
        ]}
      />
      <div className="flex gap-2 flex-wrap">
        {!gameState ? (
          <Button onClick={startGame} className="flex-1 sm:flex-none">
            Deal
          </Button>
        ) : (
          <>
            <Button
              onClick={hit}
              disabled={!isPlayerTurn || isOver}
              variant="default"
              className="flex-1 sm:flex-none"
            >
              Hit
            </Button>
            <Button
              onClick={stand}
              disabled={!isPlayerTurn || isOver}
              variant="outline"
              className="flex-1 sm:flex-none"
            >
              Stand
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const endScreen =
    isOver && gameState ? blackjackHeadline(gameState) : null;

  // Dedicated sr-only polite live region. The route otherwise has no
  // role=status / aria-live node, so turn and result cues are silent to
  // assistive tech; this announces them on every state change (GAM-122).
  const liveStatus = gameState ? blackjackLiveCue(gameState, playerValue) : "";

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <BrandHeader title="Blackjack" backLabel="Back" />
      {/* Screen-reader turn/result announcer — always leads with the current
          cue so a keyboard/SR player hears the outcome after deal, hit, stand,
          bust, dealer result, and rematch (GAM-122). */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </p>
      <div className="flex-1 flex items-stretch p-4 md:p-8">
        <div className="flex-1 max-w-2xl mx-auto">
          <GameShell state={shellState} gameType="blackjack" actionArea={actionArea} />
        </div>
      </div>

      {endScreen && (
        <EndGameScreen
          headline={endScreen.headline}
          subline={endScreen.subline}
          sessionRows={[
            { label: "Wins", value: session.wins },
            { label: "Losses", value: session.losses },
            { label: "Pushes", value: session.pushes },
          ]}
          onPlayAgain={startGame}
          onChangeGame={() => router.push("/")}
        />
      )}
    </div>
  );
}
