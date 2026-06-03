"use client";

import type { ShellCard } from "@/lib/games/shell-types";
import { PlayingCard } from "./card";

interface PlayerHandProps {
  cards: ShellCard[];
  isSelf: boolean;
  label?: string;
}

export function PlayerHand({ cards, isSelf, label }: PlayerHandProps) {
  const size = isSelf ? "md" : "sm";

  if (cards.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground italic">
        {label && <span>{label}: </span>}
        <span>No cards</span>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1.5 flex-wrap">
      {cards.map((card, i) => (
        <PlayingCard key={`${card.suit}-${card.rank}-${i}`} card={card} size={size} />
      ))}
    </div>
  );
}
