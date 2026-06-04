"use client";

import type { ShellCard } from "@/lib/games/shell-types";
import { CardHand } from "./card-hand";

interface PlayerHandProps {
  cards: ShellCard[];
  isSelf: boolean;
  gameType: string;
  label?: string;
}

export function PlayerHand({ cards, isSelf, gameType, label }: PlayerHandProps) {
  const size = isSelf ? "md" : "sm";

  return (
    <CardHand
      cards={cards}
      gameType={gameType}
      label={label}
      showSortPicker={isSelf}
      size={size}
    />
  );
}
