"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EndGameScreen } from "@/components/game/end-game-screen";
import { PlayingCard } from "@/components/game/card";
import {
  dealGame,
  applyAction,
  canCallYaniv,
  handTotal,
  yanivCardValue,
  isValidDiscard,
  discardPileTop,
  type YanivGameState,
  type YanivPlayer,
} from "@/lib/games/yaniv";
import { YanivBot } from "@/lib/bots/yaniv-bot";
import type { ShellCard } from "@/lib/games/shell-types";

const PLAYER_ID = "player-1";
const BOT_ID = "bot-1";
const bot = new YanivBot();

function toShellCard(card: { suit: string; rank: string }, faceUp = true): ShellCard {
  return { suit: card.suit as ShellCard["suit"], rank: card.rank as ShellCard["rank"], faceUp };
}

function runBotTurns(state: YanivGameState): YanivGameState {
  let s = state;
  let guard = 0;
  while (
    s.status === "in_progress" &&
    s.players[s.currentPlayerIndex]?.isBot &&
    guard < 20
  ) {
    const botId = s.players[s.currentPlayerIndex].id;
    s = applyAction(s, bot.getNextMove(s, botId));
    guard++;
  }
  return s;
}

function newGame(): YanivGameState {
  return dealGame(`game-${Date.now()}`, [
    { id: PLAYER_ID, name: "You", isBot: false },
    { id: BOT_ID, name: "Bot", isBot: true },
  ]);
}

export default function YanivPage() {
  const router = useRouter();
  const [gameState, setGameState] = useState<YanivGameState | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [roundsWon, setRoundsWon] = useState(0);
  const [roundsLost, setRoundsLost] = useState(0);

  const startGame = useCallback(() => {
    const state = runBotTurns(newGame());
    setGameState(state);
    setSelected([]);
  }, []);

  function dispatch(state: YanivGameState) {
    const next = runBotTurns(state);
    setGameState(next);
    setSelected([]);
    if (next.status === "round_over" || next.status === "game_over") {
      const result = next.roundResult;
      if (result) {
        const playerWon = result.callerId === PLAYER_ID && !result.assaf;
        if (playerWon) setRoundsWon((n) => n + 1);
        else setRoundsLost((n) => n + 1);
      }
    }
  }

  function toggleCard(idx: number) {
    setSelected((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx],
    );
  }

  function callYaniv() {
    if (!gameState) return;
    dispatch(applyAction(gameState, { type: "CALL_YANIV", playerId: PLAYER_ID }));
  }

  function discardAndDraw(drawFromDiscard: boolean) {
    if (!gameState || selected.length === 0) return;
    dispatch(
      applyAction(gameState, {
        type: "DISCARD_AND_DRAW",
        playerId: PLAYER_ID,
        discardIndices: selected,
        drawFromDiscard,
      }),
    );
  }

  function nextRound() {
    if (!gameState) return;
    const next = applyAction(gameState, { type: "NEXT_ROUND", playerId: PLAYER_ID });
    const withBots = runBotTurns(next);
    setGameState(withBots);
    setSelected([]);
  }

  if (!gameState) {
    return (
      <div className="flex flex-col min-h-screen bg-zinc-900">
        <header className="flex items-center justify-between px-4 py-3 md:px-8 border-b border-white/10">
          <h1 className="text-white font-semibold text-lg">Yaniv</h1>
          <a href="/" className="text-sm text-white/60 hover:text-white">← Back</a>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-white/70 mb-6 max-w-xs">
              Discard cards and call Yaniv when your hand totals 7 or less.
            </p>
            <Button onClick={startGame} size="lg">Deal</Button>
          </div>
        </div>
      </div>
    );
  }

  const player = gameState.players.find((p) => p.id === PLAYER_ID)!;
  const bots = gameState.players.filter((p) => p.isBot);
  const isMyTurn =
    gameState.status === "in_progress" &&
    gameState.players[gameState.currentPlayerIndex]?.id === PLAYER_ID;
  const playerTotal = handTotal(player.hand);
  const canYaniv = isMyTurn && canCallYaniv(player.hand);
  const selectedCards = selected.map((i) => player.hand[i]).filter(Boolean);
  const canDiscard = isMyTurn && isValidDiscard(selectedCards);
  const topCard = discardPileTop(gameState);
  const isRoundOver = gameState.status === "round_over";
  const isGameOver = gameState.status === "game_over";

  return (
    <div className="flex flex-col min-h-screen bg-zinc-900">
      <header className="flex items-center justify-between px-4 py-3 md:px-8 border-b border-white/10">
        <h1 className="text-white font-semibold text-lg">Yaniv</h1>
        <a href="/" className="text-sm text-white/60 hover:text-white">← Back</a>
      </header>

      <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 max-w-2xl mx-auto w-full">
        {/* Bot hands */}
        {bots.map((b) => (
          <BotSeat key={b.id} player={b} isActive={gameState.players[gameState.currentPlayerIndex]?.id === b.id} />
        ))}

        {/* Discard pile */}
        <div className="flex items-center gap-4 justify-center py-2">
          <div className="text-white/60 text-sm">Discard pile:</div>
          {topCard ? (
            <PlayingCard card={toShellCard(topCard)} size="md" />
          ) : (
            <div className="w-14 h-20 rounded-lg border border-white/20 flex items-center justify-center text-white/30 text-xs">
              empty
            </div>
          )}
          <div className="text-white/40 text-xs">{gameState.deck.length} in deck</div>
        </div>

        {/* Player hand */}
        <div className="bg-white/5 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white text-sm font-medium">
              {player.name}
              {isMyTurn && <span className="ml-2 text-emerald-400 text-xs">— your turn</span>}
            </span>
            <div className="flex items-center gap-3 text-xs tabular-nums text-white/60">
              <span>Score: {player.score}</span>
              <span>Hand: {playerTotal}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {player.hand.map((card, i) => (
              <button
                key={`${card.suit}-${card.rank}-${i}`}
                onClick={() => isMyTurn && toggleCard(i)}
                className={`rounded-lg transition-transform outline-none ${
                  selected.includes(i)
                    ? "-translate-y-3 ring-2 ring-emerald-400"
                    : isMyTurn
                    ? "hover:-translate-y-1 cursor-pointer"
                    : "cursor-default"
                }`}
                aria-pressed={selected.includes(i)}
              >
                <PlayingCard card={toShellCard(card)} size="md" />
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        {isMyTurn && (
          <div className="flex flex-col gap-2">
            {canYaniv && (
              <Button onClick={callYaniv} className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold">
                Call Yaniv! (hand = {playerTotal})
              </Button>
            )}
            {selected.length > 0 && (
              <div className="text-white/60 text-xs text-center">
                Selected: {selectedCards.map((c) => `${c.rank}${suitSymbol(c.suit)}`).join(", ")}
                {" "}({selectedCards.reduce((s, c) => s + yanivCardValue(c.rank), 0)} pts)
                {!isValidDiscard(selectedCards) && (
                  <span className="text-red-400 ml-1">— not a valid combo</span>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => discardAndDraw(false)}
                disabled={!canDiscard}
                className="flex-1"
                variant="default"
              >
                Discard & Draw from Deck
              </Button>
              <Button
                onClick={() => discardAndDraw(true)}
                disabled={!canDiscard || !topCard}
                className="flex-1"
                variant="outline"
              >
                Discard & Take {topCard ? `${topCard.rank}${suitSymbol(topCard.suit)}` : "pile"}
              </Button>
            </div>
            {selected.length === 0 && !canYaniv && (
              <p className="text-white/40 text-xs text-center">
                Tap a card (or cards) to select, then discard
              </p>
            )}
          </div>
        )}

        {!isMyTurn && gameState.status === "in_progress" && (
          <p className="text-white/40 text-sm text-center">Bot is thinking…</p>
        )}
      </div>

      {/* Round over overlay */}
      {isRoundOver && gameState.roundResult && (
        <RoundEndOverlay
          state={gameState}
          playerId={PLAYER_ID}
          onNextRound={nextRound}
          onChangeGame={() => router.push("/")}
        />
      )}

      {/* Game over overlay */}
      {isGameOver && (
        <EndGameScreen
          headline={gameState.winnerId === PLAYER_ID ? "You Win!" : "Bot Wins"}
          subline={
            gameState.winnerId === PLAYER_ID
              ? "You outlasted the bot!"
              : "Better luck next time."
          }
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

function BotSeat({ player, isActive }: { player: YanivPlayer; isActive: boolean }) {
  return (
    <div
      className={`rounded-xl p-3 transition-colors ${
        isActive ? "bg-emerald-900/40 ring-2 ring-emerald-500/50" : "bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-white text-sm font-medium">{player.name}</span>
        {isActive && <span className="text-emerald-400 text-xs">thinking…</span>}
        <div className="flex items-center gap-3 text-xs tabular-nums text-white/50 ml-auto">
          <span>Score: {player.score}</span>
          <span>Hand: —</span>
        </div>
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {player.hand.map((_, i) => (
          <PlayingCard key={i} card={{ suit: "spades", rank: "A", faceUp: false }} size="sm" />
        ))}
      </div>
    </div>
  );
}

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
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-2xl flex flex-col gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-card-foreground">{headline}</p>
          <p className="text-sm text-muted-foreground mt-1">Round {state.round} complete</p>
        </div>

        {/* All hands */}
        <div className="space-y-2">
          {state.players.filter((p) => !p.eliminated).map((p) => (
            <div key={p.id} className="flex items-start gap-3">
              <div className="w-14 text-sm text-muted-foreground shrink-0">
                {p.name}
              </div>
              <div className="flex flex-wrap gap-1">
                {p.hand.map((c, i) => (
                  <PlayingCard key={i} card={toShellCard(c)} size="sm" />
                ))}
              </div>
              <div className="ml-auto text-sm font-semibold tabular-nums text-foreground shrink-0">
                {result.handTotals[p.id] ?? 0} pts
              </div>
            </div>
          ))}
        </div>

        {/* Updated scores */}
        <div className="border-t border-border pt-3">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2 text-center">
            Scores after round {state.round}
          </p>
          <div className="flex justify-center gap-8">
            {state.players.map((p) => (
              <div key={p.id} className="flex flex-col items-center">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {p.score}
                </span>
                <span className="text-xs text-muted-foreground">{p.name}</span>
                {p.eliminated && (
                  <span className="text-xs text-red-400">eliminated</span>
                )}
              </div>
            ))}
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

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function suitSymbol(suit: string): string {
  return SUIT_SYMBOLS[suit] ?? suit;
}
