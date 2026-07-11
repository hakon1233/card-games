"use client";

import { memo } from "react";
import type { ShellCard } from "@/lib/games/shell-types";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

// Suit colour is driven by CSS so the four-color accessibility deck can override
// it globally (see `.pip-suit-*` rules + `html[data-card-deck]` in globals.css).
// The suit *glyph* (♥♦♣♠) is an always-on shape channel that distinguishes suits
// without any reliance on colour — critical for colorblind players (GAM-55).
const SUIT_COLOR_CLASS: Record<string, string> = {
  hearts: "pip-suit-hearts",
  diamonds: "pip-suit-diamonds",
  clubs: "pip-suit-clubs",
  spades: "pip-suit-spades",
};

type CardSize = "sm" | "md" | "lg";

// Per-size geometry + typography. `lg` exists for the top discard card, which is a
// primary decision input and must stay legible at a glance (GAM-46). `cornerTL`,
// `cornerBR`, `cornerSuit` and `pip` drive the always-visible corner index added
// for GAM-42 (see CARD_DIMENSIONS below). All class fragments are written as
// literal strings so Tailwind's JIT scanner can see them.
const SIZE_STYLES: Record<
  CardSize,
  { box: string; rank: string; cornerTL: string; cornerBR: string; cornerSuit: string; pip: string }
> = {
  sm: { box: "w-10 h-14", rank: "text-xs", cornerTL: "top-0.5 left-0.5", cornerBR: "bottom-0.5 right-0.5", cornerSuit: "text-[0.6rem]", pip: "text-lg" },
  md: { box: "w-14 h-20", rank: "text-sm", cornerTL: "top-1 left-1", cornerBR: "bottom-1 right-1", cornerSuit: "text-xs", pip: "text-2xl" },
  lg: { box: "w-20 h-28", rank: "text-xl", cornerTL: "top-1.5 left-1.5", cornerBR: "bottom-1.5 right-1.5", cornerSuit: "text-sm", pip: "text-4xl" },
};

/**
 * Card geometry, in pixels, shared with the hand layout.
 *
 * `cornerWidth` is the width of the always-visible top-left index strip
 * (rank + suit). Hands compress cards *toward* this strip and never overlap
 * past it, so every card's index stays readable no matter how tightly the
 * hand is packed (GAM-42). Keep these in sync with the `box` Tailwind classes
 * in SIZE_STYLES — `cornerWidth` must be wide enough to clear the widest
 * rank ("10").
 */
export const CARD_DIMENSIONS: Record<
  CardSize,
  { width: number; height: number; cornerWidth: number }
> = {
  sm: { width: 40, height: 56, cornerWidth: 16 },
  md: { width: 56, height: 80, cornerWidth: 21 },
  lg: { width: 80, height: 112, cornerWidth: 30 },
};

interface CardProps {
  card: ShellCard;
  size?: CardSize;
}

export function bottomCornerRankText(rank: string) {
  return rank;
}

// Pure presentational component (no hooks / side effects): its output is a function
// of `card` + `size` only. Memoized so the high-frequency parent re-renders (the
// per-turn countdown clock ticks ~10×/s) don't re-render every card whose props are
// unchanged — hand cards carry stable identity from game state, so they skip.
export const PlayingCard = memo(function PlayingCard({ card, size = "md" }: CardProps) {
  const style = SIZE_STYLES[size];

  if (!card.faceUp) {
    return (
      <div
        className={`
          rounded-lg border border-white/20 shadow-md select-none
          bg-[#1a6b3c] flex items-center justify-center
          ${style.box} ${style.rank}
        `}
        aria-label="face-down card"
      >
        <div className="w-[80%] h-[80%] rounded border border-white/30" />
      </div>
    );
  }

  const symbol = SUIT_SYMBOL[card.suit];
  const suitColor = SUIT_COLOR_CLASS[card.suit];

  return (
    <div
      className={`
        rounded-lg border border-gray-200 shadow-md bg-white select-none
        relative overflow-hidden
        ${style.box} ${style.rank}
        ${suitColor}
      `}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      {/* Top-left corner index — kept inside cornerWidth so it survives overlap (GAM-42) */}
      <span className={`absolute flex flex-col items-center font-bold leading-none ${style.cornerTL}`}>
        <span>{card.rank}</span>
        <span className={style.cornerSuit} aria-hidden="true">
          {symbol}
        </span>
      </span>

      {/* Center pip */}
      <span
        className={`absolute inset-0 flex items-center justify-center leading-none ${style.pip}`}
        aria-hidden="true"
      >
        {symbol}
      </span>

      {/* Bottom-right corner index (rotated) */}
      <span
        className={`absolute flex flex-col items-center font-bold leading-none rotate-180 ${style.cornerBR}`}
        aria-hidden="true"
      >
        <span>{bottomCornerRankText(card.rank)}</span>
        <span className={style.cornerSuit}>{symbol}</span>
      </span>
    </div>
  );
});
