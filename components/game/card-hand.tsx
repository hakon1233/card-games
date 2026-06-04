"use client";

import { ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ALL_SORT_STRATEGIES,
  GAME_DEFAULT_SORT,
  SORT_LABELS,
  sortCardsWithOriginalIndices,
  type SortStrategy,
} from "@/lib/games/card-sorting";
import type { ShellCard } from "@/lib/games/shell-types";
import { PlayingCard } from "./card";

interface CardHandProps {
  cards: ShellCard[];
  gameType: string;
  onCardClick?: (card: ShellCard, index: number) => void;
  selectedIndices?: number[];
  disabledIndices?: number[];
  sortStrategy?: SortStrategy;
  onSortChange?: (s: SortStrategy) => void;
  showSortPicker?: boolean;
  label?: string;
  size?: "sm" | "md";
  cardClassName?: (card: ShellCard, index: number) => string;
}

export function CardHand({
  cards,
  gameType,
  onCardClick,
  selectedIndices = [],
  disabledIndices = [],
  sortStrategy,
  onSortChange,
  showSortPicker = true,
  label,
  size = "md",
  cardClassName,
}: CardHandProps) {
  const defaultSort = GAME_DEFAULT_SORT[gameType] ?? "none";
  const [preferredSort, setPreferredSort] = useState<SortStrategy | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const currentSort = sortStrategy ?? preferredSort ?? defaultSort;

  const sortedCards = useMemo(
    () => sortCardsWithOriginalIndices(cards, currentSort, gameType),
    [cards, currentSort, gameType],
  );

  function applySort(nextSort: SortStrategy) {
    if (!sortStrategy) setPreferredSort(nextSort);
    onSortChange?.(nextSort);
    setIsPickerOpen(false);
  }

  if (cards.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground italic">
        {label && <span>{label}: </span>}
        <span>No cards</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {showSortPicker && (
        <div className="relative flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="truncate">
            {label && <span className="font-medium text-foreground">{label}</span>}
            {label && <span className="mx-1.5 text-muted-foreground/70">/</span>}
            <span className="tabular-nums">{SORT_LABELS[currentSort]}</span>
          </span>
          <button
            type="button"
            onClick={() => setIsPickerOpen((open) => !open)}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-white/15 bg-black/15 px-2 text-xs font-medium text-foreground transition-colors hover:bg-black/25"
            aria-expanded={isPickerOpen}
          >
            <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Sort</span>
          </button>
          {isPickerOpen && (
            <div className="absolute right-0 top-8 z-20 grid w-48 gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl">
              {ALL_SORT_STRATEGIES.map((strategy) => (
                <button
                  key={strategy}
                  type="button"
                  onClick={() => applySort(strategy)}
                  className={`rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                    currentSort === strategy
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {SORT_LABELS[strategy]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {sortedCards.map(({ card, originalIndex }) => {
          const isSelected = selectedIndices.includes(originalIndex);
          const isDisabled = disabledIndices.includes(originalIndex);
          const className = cardClassName?.(card, originalIndex) ?? "";

          if (!onCardClick) {
            return (
              <PlayingCard
                key={`${card.suit}-${card.rank}-${originalIndex}`}
                card={card}
                size={size}
              />
            );
          }

          return (
            <button
              key={`${card.suit}-${card.rank}-${originalIndex}`}
              type="button"
              onClick={() => !isDisabled && onCardClick(card, originalIndex)}
              disabled={isDisabled}
              className={`rounded-lg transition-all outline-none ${className}`}
              aria-pressed={isSelected}
            >
              <PlayingCard card={card} size={size} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
