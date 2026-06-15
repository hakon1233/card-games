"use client";

import { ArrowUpDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  ALL_SORT_STRATEGIES,
  GAME_DEFAULT_SORT,
  SORT_LABELS,
  sortCardsWithOriginalIndices,
  type SortStrategy,
} from "@/lib/games/card-sorting";
import type { ShellCard } from "@/lib/games/shell-types";
import { CARD_DIMENSIONS, PlayingCard } from "./card";

// Gap between cards when the hand is roomy enough not to overlap.
const HAND_GAP = 8;
// Vertical headroom (px) reserved so selected/hovered cards can lift without
// being clipped or shifting layout. Must cover the largest -translate-y used.
const LIFT_HEADROOM = 14;

/**
 * Measure the live pixel width of an element. Drives the overlap math so the
 * hand always fits the available width while keeping every corner index
 * visible (GAM-42).
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

// Pixel geometry matching the Tailwind size classes in card.tsx.
// cornerWidth = left-corner strip that must always stay visible when cards overlap.
const CARD_DIMENSIONS = {
  sm: { width: 40, height: 56, cornerWidth: 17 },
  md: { width: 56, height: 80, cornerWidth: 23 },
} as const;

// Gap between cards when the hand is roomy enough not to overlap.
const HAND_GAP = 8;
// Vertical headroom (px) reserved so selected/hovered cards can lift without
// being clipped or shifting layout. Must cover the largest -translate-y used.
const LIFT_HEADROOM = 14;

/**
 * Measure the live pixel width of an element. Drives the overlap math so the
 * hand always fits the available width while keeping every corner index
 * visible (GAM-42).
 */
function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

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

  const [handRef, handWidth] = useMeasuredWidth<HTMLDivElement>();
  const dims = CARD_DIMENSIONS[size];

  // How far apart consecutive cards sit (the "stride"). When the hand is
  // roomy this is card width + gap; when it compresses, cards slide left over
  // one another but never past the corner index — the stride floor is
  // `cornerWidth`, so the rank+suit of every card stays visible. If the hand
  // still can't fit at that floor, the row scrolls horizontally rather than
  // clipping any index.
  const count = sortedCards.length;
  const naturalStride = dims.width + HAND_GAP;
  let stride = naturalStride;
  if (handWidth > 0 && count > 1) {
    const fitStride = (handWidth - dims.width) / (count - 1);
    stride = Math.min(naturalStride, Math.max(dims.cornerWidth, fitStride));
  }
  // Negative margin pulls each card (after the first) left onto its neighbour.
  const overlapMargin = Math.round(stride - dims.width);

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
      <div
        ref={handRef}
        className="flex items-end overflow-x-auto overflow-y-hidden"
        style={{ paddingTop: LIFT_HEADROOM }}
      >
        {sortedCards.map(({ card, originalIndex }, i) => {
          const isSelected = selectedIndices.includes(originalIndex);
          const isDisabled = disabledIndices.includes(originalIndex);
          const className = cardClassName?.(card, originalIndex) ?? "";

          // Later cards paint over earlier ones (DOM order), so each card's
          // left corner index stays exposed. A selected card lifts above the
          // overlap so its full face is readable.
          const wrapperStyle = {
            marginLeft: i === 0 ? 0 : overlapMargin,
            zIndex: isSelected ? count + 1 : undefined,
          };

          if (!onCardClick) {
            return (
              <div
                key={`${card.suit}-${card.rank}-${originalIndex}`}
                className="relative shrink-0 hover:z-50"
                style={wrapperStyle}
              >
                <PlayingCard card={card} size={size} />
              </div>
            );
          }

          return (
            <button
              key={`${card.suit}-${card.rank}-${originalIndex}`}
              type="button"
              onClick={() => !isDisabled && onCardClick(card, originalIndex)}
              disabled={isDisabled}
              className={`relative shrink-0 rounded-lg transition-all outline-none hover:z-50 focus-visible:z-50 ${className}`}
              style={wrapperStyle}
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
