"use client";

import type { ShellCard } from "@/lib/games/shell-types";

const SUIT_SYMBOL: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

const RED_SUITS = new Set(["hearts", "diamonds"]);

interface CardProps {
  card: ShellCard;
  size?: "sm" | "md";
}

export function bottomCornerRankText(rank: string) {
  return [...rank].reverse().join("");
}

export function PlayingCard({ card, size = "md" }: CardProps) {
  const isSmall = size === "sm";

  if (!card.faceUp) {
    return (
      <div
        className={`
          rounded-lg border border-white/20 shadow-md select-none
          bg-[#1a6b3c] flex items-center justify-center
          ${isSmall ? "w-10 h-14 text-xs" : "w-14 h-20 text-sm"}
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
        ${isSmall ? "w-10 h-14 p-1 text-xs" : "w-14 h-20 p-1.5 text-sm"}
        ${textColor}
      `}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span className="font-bold leading-none">{card.rank}</span>
      <span className={`text-center leading-none ${isSmall ? "text-base" : "text-xl"}`}>
        {symbol}
      </span>
      <span className="font-bold leading-none self-end rotate-180">
        {bottomCornerRankText(card.rank)}
      </span>
    </div>
  );
}
