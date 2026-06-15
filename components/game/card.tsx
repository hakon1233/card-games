"use client";

import type { ShellCard } from "@/lib/games/shell-types";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const RED_SUITS = new Set(["hearts", "diamonds"]);

type CardSize = "sm" | "md" | "lg";

interface CardProps {
  card: ShellCard;
  size?: CardSize;
}

// Per-size geometry + typography. `lg` exists for the top discard card, which is a
// primary decision input and must stay legible at a glance (GAM-46).
const SIZE_STYLES: Record<
  CardSize,
  { box: string; pad: string; rank: string; symbol: string }
> = {
  sm: { box: "w-10 h-14", pad: "p-1", rank: "text-xs", symbol: "text-base" },
  md: { box: "w-14 h-20", pad: "p-1.5", rank: "text-sm", symbol: "text-xl" },
  lg: { box: "w-20 h-28", pad: "p-2", rank: "text-xl", symbol: "text-4xl" },
};

export function bottomCornerRankText(rank: string) {
  return [...rank].reverse().join("");
}

export function PlayingCard({ card, size = "md" }: CardProps) {
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

  const isRed = RED_SUITS.has(card.suit);
  const symbol = SUIT_SYMBOL[card.suit];
  const textColor = isRed ? "text-red-600" : "text-gray-900";

  return (
    <div
      className={`
        rounded-lg border border-gray-200 shadow-md bg-white select-none
        relative flex flex-col justify-between
        ${style.box} ${style.pad} ${style.rank}
        ${textColor}
      `}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span className="font-bold leading-none">{card.rank}</span>
      <span className={`text-center leading-none ${style.symbol}`}>
        {symbol}
      </span>
      <span className="font-bold leading-none self-end rotate-180">
        {bottomCornerRankText(card.rank)}
      </span>
    </div>
  );
}
