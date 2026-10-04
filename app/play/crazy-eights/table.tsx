"use client";

// The Crazy Eights table's presentational parts: opponents' seats, the draw and discard piles
// with the suit to match, and the suit picker for an eight.

import { Button } from "@/components/ui/button";
import { PlayingCard, SUIT_COLOR_CLASS, SUIT_SYMBOL } from "@/components/game/card";
import { SUITS } from "@/lib/games/deck-utils";
import { toShellCard } from "@/lib/games/shell-types";
import type { Card, Suit } from "@/lib/games/types";

const SUIT_LABEL: Record<Suit, string> = {
  hearts: "Hearts",
  diamonds: "Diamonds",
  clubs: "Clubs",
  spades: "Spades",
};

export function Piles({
  drawCount,
  canDraw,
  onDraw,
  discardTop,
  matchSuit,
  declared,
}: {
  drawCount: number;
  canDraw: boolean;
  onDraw: () => void;
  discardTop: Card;
  matchSuit: Suit;
  declared: boolean;
}) {
  return (
    <div className="flex flex-1 items-center justify-center gap-6 py-2 md:gap-10">
      <div className="flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={onDraw}
          disabled={!canDraw}
          aria-label={`Draw a card. ${drawCount} in the draw pile.`}
          className="rounded-lg outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring enabled:hover:-translate-y-1 disabled:cursor-default"
        >
          <FaceDownStack count={drawCount} />
        </button>
        <div className="flex flex-col items-center leading-none">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Draw
          </span>
          <span className="text-[9px] tabular-nums text-muted-foreground/70">
            {drawCount} left
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
          <SuitChip suit={matchSuit} declared={declared} />
        </div>
      </div>
    </div>
  );
}

export function OpponentSeat({
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

export function SuitPicker({
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
          {SUITS.map((suit) => (
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
