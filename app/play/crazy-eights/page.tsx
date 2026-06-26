"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandHeader } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { CardHand } from "@/components/game/card-hand";
import { PlayingCard } from "@/components/game/card";
import { EndGameScreen } from "@/components/game/end-game-screen";
import {
  AnimationPreferencesControl,
  useAnimationSpeed,
} from "@/components/game/animation-preferences-control";
import { CardDeckControl, useCardDeck } from "@/components/game/card-deck-control";
import { scaleAnimationDuration } from "@/lib/animation-preferences";
import {
  dealGame,
  applyPlayCard,
  applyDrawCard,
  isPlayable,
  topCard,
  effectiveSuit,
  playableCards,
  type CrazyEightsState,
} from "@/lib/games/crazy-eights";
import { CrazyEightsBot } from "@/lib/bots/crazy-eights-bot";
import type { Rank, Suit } from "@/lib/games/types";
import type { ShellCard } from "@/lib/games/shell-types";

const PLAYER_ID = "player-1";
const PLAYER_NAME = "You";
// Base pause between bot moves so plays are watchable; scaled by the
// animation-speed preference (reduced collapses it to near-instant).
const BOT_TURN_MS = 850;
const bot = new CrazyEightsBot();

const SUIT_SYMBOL: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};
const SUIT_COLOR_CLASS: Record<Suit, string> = {
  hearts: "pip-suit-hearts",
  diamonds: "pip-suit-diamonds",
  clubs: "pip-suit-clubs",
  spades: "pip-suit-spades",
};
const SUIT_LABEL: Record<Suit, string> = {
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs",
  spades: "Spades",
};
const ALL_SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];

function toShellCard(card: { suit: Suit; rank: Rank }, faceUp = true): ShellCard {
  return { suit: card.suit, rank: card.rank, faceUp };
}

function buildPlayerDefs(numBots: number): { id: string; isBot: boolean }[] {
  const defs = [{ id: PLAYER_ID, isBot: false }];
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
      if (next.winnerId === PLAYER_ID) setWins((w) => w + 1);
      else setLosses((l) => l + 1);
    }
  }, []);

  // ── Bot turn driver ───────────────────────────────────────────────────────
  // After every state change, if the active seat is a bot, schedule exactly one
  // move. Applying it produces a new state, which re-runs this effect and steps
  // the next bot — so a chain of bots resolves one visible move at a time.
  useEffect(() => {
    const s = gameState;
    if (!s || s.status !== "in_progress") return;
    const current = s.players[s.currentPlayerIndex];
    if (!current?.isBot) return;

    const delay = scaleAnimationDuration(BOT_TURN_MS, animationSpeed);
    const timer = setTimeout(() => {
      const cur = gameStateRef.current;
      if (!cur || cur.status !== "in_progress") return;
      const seat = cur.players[cur.currentPlayerIndex];
      if (!seat?.isBot) return;
      const move = bot.getNextMove(cur, seat.id);
      const next =
        move.type === "PLAY_CARD"
          ? applyPlayCard(cur, move.playerId, move.cardIndex, move.declaredSuit)
          : applyDrawCard(cur, move.playerId);
      commitState(next);
    }, delay);

    return () => clearTimeout(timer);
  }, [gameState, animationSpeed, commitState]);

  const startGame = useCallback(() => {
    const defs = buildPlayerDefs(numBots);
    resultRecordedRef.current = false;
    setPendingEight(null);
    setGameState(
      dealGame(
        `crazy-eights-${Date.now()}`,
        defs.map((d) => d.id),
        defs.map((d) => d.isBot),
      ),
    );
  }, [numBots]);

  const humanPlay = useCallback((index: number, declaredSuit?: Suit) => {
    const s = gameStateRef.current;
    if (!s) return;
    if (s.players[s.currentPlayerIndex]?.id !== PLAYER_ID) return;
    const human = s.players.find((p) => p.id === PLAYER_ID);
    const card = human?.hand[index];
    if (!card || !isPlayable(card, s)) return;
    if (card.rank === "8" && !declaredSuit) {
      setPendingEight(index);
      return;
    }
    setPendingEight(null);
    commitState(applyPlayCard(s, PLAYER_ID, index, declaredSuit));
  }, [commitState]);

  const humanDraw = useCallback(() => {
    const s = gameStateRef.current;
    if (!s) return;
    if (s.players[s.currentPlayerIndex]?.id !== PLAYER_ID) return;
    commitState(applyDrawCard(s, PLAYER_ID));
  }, [commitState]);

  // ── Settings / pre-game screen ────────────────────────────────────────────
  if (!gameState) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <BrandHeader title="Crazy Eights" backLabel="Back" />
        <div className="flex flex-1 items-center justify-center px-4 py-8">
          <div className="flex w-full max-w-sm flex-col gap-6 rounded-lg border border-border bg-card/70 p-5 shadow-sm">
            <div className="text-center">
              <p className="pip-eyebrow text-xs">Crazy Eights table</p>
              <h2 className="mt-2 font-heading text-2xl font-bold text-foreground">
                Game Settings
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Match the suit or rank of the top card. Eights are wild — play one to
                choose the suit. First to empty their hand wins.
              </p>
            </div>

            <SettingRow label="Number of Bots">
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumBots(n)}
                    aria-pressed={numBots === n}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold transition-colors ${
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

            <SettingRow label="Animation Speed">
              <AnimationPreferencesControl value={animationSpeed} onChange={setAnimationSpeed} />
            </SettingRow>

            <SettingRow label="Card Colors">
              <CardDeckControl value={cardDeck} onChange={setCardDeck} />
              <p className="mt-1 text-xs text-muted-foreground">
                Four-color gives each suit its own color. Suit symbols always show too.
              </p>
            </SettingRow>

            <Button onClick={startGame} size="lg" className="mt-2 h-12 w-full text-base font-bold">
              Start Game
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── In-game derived view ──────────────────────────────────────────────────
  const human = gameState.players.find((p) => p.id === PLAYER_ID)!;
  const opponents = gameState.players.filter((p) => p.id !== PLAYER_ID);
  const activeSeat = gameState.players[gameState.currentPlayerIndex];
  const isMyTurn = gameState.status === "in_progress" && activeSeat?.id === PLAYER_ID;
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
    gameState.winnerId === PLAYER_ID
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
        ? gameState.winnerId === PLAYER_ID
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

          {/* Center board: draw pile + discard + suit-to-match */}
          <div className="flex flex-1 items-center justify-center gap-6 py-2 md:gap-10">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={humanDraw}
                disabled={!isMyTurn}
                aria-label={`Draw a card. ${gameState.deck.length} in the draw pile.`}
                className="rounded-lg outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring enabled:hover:-translate-y-1 disabled:cursor-default"
              >
                <FaceDownStack count={gameState.deck.length} />
              </button>
              <div className="flex flex-col items-center leading-none">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Draw
                </span>
                <span className="text-[9px] tabular-nums text-muted-foreground/70">
                  {gameState.deck.length} left
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <div className="flex min-h-[112px] items-center justify-center">
                <PlayingCard card={toShellCard(discardTop)} size="lg" />
              </div>
              <div className="flex flex-col items-center gap-1 leading-none">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discard
                </span>
                <SuitChip suit={matchSuit} declared={declaredActive} />
              </div>
            </div>
          </div>

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
          headline={gameState.winnerId === PLAYER_ID ? "You Win!" : "Round Over"}
          subline={
            gameState.winnerId === PLAYER_ID
              ? "You emptied your hand first."
              : `${winnerName ?? "A bot"} emptied their hand first.`
          }
          winnerName={winnerName}
          sessionRows={[
            { label: "Wins", value: wins },
            { label: "Losses", value: losses },
          ]}
          finalScoreRows={gameState.players.map((p) => ({
            label: p.id === PLAYER_ID ? PLAYER_NAME : botName(p.id),
            value: `${p.hand.length} card${p.hand.length === 1 ? "" : "s"} left`,
          }))}
          onPlayAgain={startGame}
          onChangeGame={() => router.push("/")}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
    </div>
  );
}

function OpponentSeat({
  name,
  cardCount,
  isActive,
}: {
  name: string;
  cardCount: number;
  isActive: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all ${
        isActive ? "bg-primary/[0.12] ring-2 ring-primary/50" : "opacity-70"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-medium text-foreground">{name}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          BOT
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <FaceDownStack count={cardCount} mini />
        <span
          className="min-w-[20px] rounded-full bg-foreground px-1 text-center text-[11px] font-bold leading-5 tabular-nums text-background"
          aria-label={`${cardCount} card${cardCount === 1 ? "" : "s"} in hand`}
        >
          {cardCount}
        </span>
      </div>
      {isActive && <span className="text-[9px] font-semibold text-primary">↑ turn</span>}
    </div>
  );
}

function FaceDownStack({ count, mini = false }: { count: number; mini?: boolean }) {
  const w = mini ? 28 : 80;
  const h = mini ? 40 : 112;
  if (count === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border-2 border-dashed border-white/20 text-[9px] text-muted-foreground/50"
        style={{ width: w, height: h }}
        aria-label="empty pile"
      >
        {mini ? "" : "empty"}
      </div>
    );
  }
  const layers = Math.min(count, mini ? 2 : 4);
  return (
    <div className="relative" style={{ width: w, height: h }} role="img" aria-hidden={mini}>
      {Array.from({ length: layers }, (_, i) => (
        <div
          key={i}
          className="absolute flex items-center justify-center rounded-lg border border-white/20 bg-[#1a6b3c] shadow-md"
          style={{
            width: w,
            height: h,
            top: i * (mini ? 1.5 : 2.5),
            left: i * (mini ? 1.5 : 2.5),
            zIndex: i,
          }}
        >
          {i === layers - 1 && (
            <div className="rounded border border-white/30" style={{ width: "80%", height: "80%" }} />
          )}
        </div>
      ))}
    </div>
  );
}

function SuitChip({ suit, declared }: { suit: Suit; declared: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-[11px] font-semibold"
      aria-label={`Suit to match: ${SUIT_LABEL[suit]}${declared ? ", declared by an eight" : ""}`}
    >
      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
        {declared ? "Declared" : "Match"}
      </span>
      <span className={`${SUIT_COLOR_CLASS[suit]} text-sm`} aria-hidden="true">
        {SUIT_SYMBOL[suit]}
      </span>
      <span className="text-foreground">{SUIT_LABEL[suit]}</span>
    </span>
  );
}

function SuitPicker({
  onPick,
  onCancel,
}: {
  onPick: (suit: Suit) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a suit"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-xs rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <p className="text-center text-sm font-semibold text-card-foreground">
          You played an 8 — choose the new suit
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {ALL_SUITS.map((suit) => (
            <button
              key={suit}
              type="button"
              onClick={() => onPick(suit)}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-background/40 py-4 transition-colors hover:bg-accent"
            >
              <span className={`${SUIT_COLOR_CLASS[suit]} text-3xl`} aria-hidden="true">
                {SUIT_SYMBOL[suit]}
              </span>
              <span className="text-xs font-medium text-foreground">{SUIT_LABEL[suit]}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" className="mt-4 w-full" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
