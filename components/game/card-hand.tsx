"use client";

import { ArrowUpDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  ALL_SORT_STRATEGIES,
  GAME_DEFAULT_SORT,
  SORT_LABELS,
  orderCardKeysForHand,
  sortCardsWithOriginalIndices,
  type SortStrategy,
} from "@/lib/games/card-sorting";
import type { ShellCard } from "@/lib/games/shell-types";
import { CARD_DIMENSIONS, PlayingCard } from "./card";

// Gap between cards when the hand is roomy enough not to overlap.
const HAND_GAP = 8;
const FAN_ROTATION_DEG = 3;
const FAN_LIFT_CURVE = 0.9;
// Vertical headroom (px) reserved so selected/hovered cards can lift without
// being clipped or shifting layout. Must cover the largest -translate-y used.
const LIFT_HEADROOM = 14;

// The hand re-shapes — not just re-scales — across device form factors (GAM-50):
//   • portrait   — a compact arc that stays low and thumb-reachable.
//   • standard   — the baseline desktop-window fan (identity, unchanged).
//   • widescreen — a visibly wider arc: cards spread apart (larger gap) and the
//     fan opens up, so the cards are *repositioned* rather than merely zoomed.
// Each profile scales the per-card rotation, the lift curve, and the inter-card
// gap that decides how far cards spread when there is room. `standard` is
// identity so the long-established baseline layout is byte-for-byte untouched.
export type HandFormFactor = "portrait" | "standard" | "widescreen";

const ARC_PROFILES: Record<HandFormFactor, { rotation: number; lift: number; gap: number }> = {
  portrait: { rotation: 0.7, lift: 0.7, gap: HAND_GAP },
  standard: { rotation: 1, lift: 1, gap: HAND_GAP },
  widescreen: { rotation: 1.5, lift: 1.3, gap: HAND_GAP * 3 },
};

// Round to nearest integer by magnitude so the fan stays symmetric about the
// centre card. Plain Math.round breaks ties toward +∞, which skews the two
// halves of the arc once a profile multiplier yields *.5 degree angles.
function symmetricRound(value: number) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

interface HandLayoutInput {
  count: number;
  handWidth: number;
  cardDimensions: { width: number; height: number; cornerWidth: number };
  formFactor?: HandFormFactor;
}

export function calculateHandLayout({
  count,
  handWidth,
  cardDimensions,
  formFactor = "standard",
}: HandLayoutInput) {
  const profile = ARC_PROFILES[formFactor] ?? ARC_PROFILES.standard;
  // Widescreen spreads cards farther apart so the arc literally widens; portrait
  // and standard keep the tight natural gap so the hand stays thumb-reachable.
  const naturalStride = cardDimensions.width + profile.gap;
  const compactStride = cardDimensions.cornerWidth;
  let stride = naturalStride;

  if (handWidth > 0 && count > 1) {
    const fitStride = (handWidth - cardDimensions.width) / (count - 1);
    stride = Math.min(naturalStride, Math.max(compactStride, fitStride));
  }

  const overlapMargin = Math.round(stride - cardDimensions.width);
  const contentWidth = count > 0 ? cardDimensions.width + stride * (count - 1) : 0;
  const needsScroll = handWidth > 0 && contentWidth > handWidth;
  const midpoint = (count - 1) / 2;
  const rotationStep = FAN_ROTATION_DEG * profile.rotation;
  const liftCurve = FAN_LIFT_CURVE * profile.lift;

  const cards = Array.from({ length: count }, (_, index) => {
    const offset = index - midpoint;
    return {
      rotation: symmetricRound(offset * rotationStep),
      translateY: Math.round(Math.abs(offset) ** 2 * liftCurve),
    };
  });

  return { stride, overlapMargin, contentWidth, needsScroll, cards };
}

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

function cardOrderKey(card: ShellCard) {
  return `${card.rank}:${card.suit}:${card.faceUp ? "up" : "down"}`;
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
  /** Device form factor — reshapes the fan (wider arc on widescreen, compact in
   *  the portrait thumb zone). Defaults to the baseline desktop fan. */
  formFactor?: HandFormFactor;
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
  formFactor = "standard",
}: CardHandProps) {
  const defaultSort = GAME_DEFAULT_SORT[gameType] ?? "none";
  const [preferredSort, setPreferredSort] = useState<SortStrategy | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[]>(() =>
    orderCardKeysForHand(cards, [], cardOrderKey),
  );
  const [draggedCardKey, setDraggedCardKey] = useState<string | null>(null);
  const currentSort = sortStrategy ?? preferredSort ?? defaultSort;

  const normalizedManualOrder = useMemo(
    () => orderCardKeysForHand(cards, manualOrder, cardOrderKey),
    [cards, manualOrder],
  );

  const sortedCards = useMemo(
    () => {
      const cardsWithOriginalIndices = sortCardsWithOriginalIndices(cards, currentSort, gameType);

      if (currentSort !== "none") return cardsWithOriginalIndices;

      const order = new Map(normalizedManualOrder.map((key, index) => [key, index]));
      return [...cardsWithOriginalIndices].sort(
        (a, b) =>
          (order.get(cardOrderKey(a.card)) ?? a.originalIndex) -
          (order.get(cardOrderKey(b.card)) ?? b.originalIndex),
      );
    },
    [cards, currentSort, gameType, normalizedManualOrder],
  );

  const [handRef, handWidth] = useMeasuredWidth<HTMLDivElement>();
  const dims = CARD_DIMENSIONS[size];

  // How far apart consecutive cards sit (the "stride"). The layout helper also
  // adds the gentle fan/arc and preserves the GAM-42 corner-index floor.
  const count = sortedCards.length;
  const layout = calculateHandLayout({
    count,
    handWidth,
    cardDimensions: dims,
    formFactor,
  });

  function applySort(nextSort: SortStrategy) {
    if (!sortStrategy) setPreferredSort(nextSort);
    onSortChange?.(nextSort);
    setIsPickerOpen(false);
  }

  function moveManualCard(sourceKey: string, targetKey: string) {
    if (!sourceKey || sourceKey === targetKey) return;

    setManualOrder((order) => {
      const nextOrder = orderCardKeysForHand(cards, order, cardOrderKey);
      const sourceIndex = nextOrder.indexOf(sourceKey);
      const targetIndex = nextOrder.indexOf(targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return nextOrder;

      const [source] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, source);
      return nextOrder;
    });

    if (currentSort !== "none") applySort("none");
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
          const orderKey = cardOrderKey(card);

          // Later cards paint over earlier ones (DOM order), so each card's
          // left corner index stays exposed. A selected card lifts above the
          // overlap so its full face is readable.
          const fan = layout.cards[i];
          const wrapperStyle = {
            marginLeft: i === 0 ? 0 : layout.overlapMargin,
            zIndex: isSelected ? count + 1 : undefined,
            transform: `translateY(${fan.translateY}px) rotate(${fan.rotation}deg)`,
            transformOrigin: "50% 100%",
            opacity: draggedCardKey === orderKey ? 0.55 : undefined,
          };

          if (!onCardClick) {
            return (
              <div
                key={`${card.suit}-${card.rank}-${originalIndex}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", orderKey);
                  setDraggedCardKey(orderKey);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveManualCard(event.dataTransfer.getData("text/plain"), orderKey);
                  setDraggedCardKey(null);
                }}
                onDragEnd={() => setDraggedCardKey(null)}
                className="relative shrink-0 hover:z-50"
                style={wrapperStyle}
              >
                <div className="transition-transform duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1.15)] hover:-translate-y-2">
                  <PlayingCard card={card} size={size} />
                </div>
              </div>
            );
          }

          return (
            <div
              key={`${card.suit}-${card.rank}-${originalIndex}`}
              draggable={!isDisabled}
              onDragStart={(event) => {
                if (isDisabled) return;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", orderKey);
                setDraggedCardKey(orderKey);
              }}
              onDragOver={(event) => {
                if (isDisabled) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (isDisabled) return;
                event.preventDefault();
                moveManualCard(event.dataTransfer.getData("text/plain"), orderKey);
                setDraggedCardKey(null);
              }}
              onDragEnd={() => setDraggedCardKey(null)}
              className="relative shrink-0 hover:z-50 focus-within:z-50"
              style={wrapperStyle}
            >
              <button
                type="button"
                onClick={() => !isDisabled && onCardClick(card, originalIndex)}
                disabled={isDisabled}
                className={`relative rounded-lg transition-all duration-300 ease-[cubic-bezier(0.2,0.9,0.2,1.15)] outline-none hover:-translate-y-2 disabled:hover:translate-y-0 ${className}`}
                aria-pressed={isSelected}
              >
                <PlayingCard card={card} size={size} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
