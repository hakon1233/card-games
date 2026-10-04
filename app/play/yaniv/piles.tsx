"use client";

// The draw pile, the discard pile and a Quick Draw window's fresh discard.

import { useMemo } from "react";
import { PlayingCard } from "@/components/game/card";
import { formatQuickDrawTime } from "@/lib/games/quick-draw-ui";
import { toShellCard } from "@/lib/games/shell-types";
import type { Card } from "@/lib/games/types";
import { ContextTooltip } from "./context-tooltip";

// ── QuickDrawPile ─────────────────────────────────────────────────────────

export function QuickDrawPile({
  cards,
  progress,
  timeLeftMs,
  canSteal,
  onSteal,
}: {
  cards: Card[];
  progress: number;
  timeLeftMs: number;
  canSteal: boolean;
  onSteal: () => void;
}) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);
  // Stabilize converted-card identity so PlayingCard's memo bails out across
  // the 10Hz quick-draw clock ticks (progress/timeLeftMs change, cards don't).
  const shellCards = useMemo(() => cards.map((card) => toShellCard(card)), [cards]);

  return (
    <ContextTooltip
      text={
        canSteal
          ? "Quick draw: steal this fresh discard before the timer empties."
          : "Quick draw window: another player may steal this fresh discard."
      }
      className="relative flex items-center gap-1"
    >
      {shellCards.map((card, i) => (
        <div
          key={i}
          className={`rounded-lg ring-2 ring-amber-400 shadow-lg shadow-amber-400/30 ${
            canSteal ? "animate-pulse cursor-pointer" : ""
          }`}
          onClick={canSteal ? onSteal : undefined}
          role={canSteal ? "button" : undefined}
          aria-label={canSteal ? "Steal from discard pile" : undefined}
        >
          <PlayingCard card={card} size="sm" />
        </div>
      ))}
      <svg
        width={radius * 2 + 8}
        height={radius * 2 + 8}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%) rotate(-90deg)",
          pointerEvents: "none",
        }}
      >
        <circle
          cx={radius + 4}
          cy={radius + 4}
          r={radius}
          fill="none"
          stroke="rgba(251,191,36,0.2)"
          strokeWidth="3"
        />
        <circle
          cx={radius + 4}
          cy={radius + 4}
          r={radius}
          fill="none"
          stroke="rgb(251,191,36)"
          strokeWidth="3"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.05s linear" }}
        />
      </svg>
      <span
        className="absolute text-[10px] font-bold text-amber-300 tabular-nums pointer-events-none"
        style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {formatQuickDrawTime(timeLeftMs)}
      </span>
      {canSteal && (
        <button
          onClick={onSteal}
          className="absolute inset-0 rounded-lg hover:bg-amber-400/10 transition-colors"
          aria-label="Steal discarded cards"
        />
      )}
    </ContextTooltip>
  );
}

// ── DiscardPileGroup ──────────────────────────────────────────────────────

export function DiscardPileGroup({
  group,
  canDraw,
  onPickCard,
}: {
  group: Card[];
  canDraw: boolean;
  onPickCard: (idx: number) => void;
}) {
  if (group.length === 0) {
    return (
      <div className="w-20 h-28 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/50 text-[10px]">
        empty
      </div>
    );
  }
  // A single discarded card gets the full large treatment (the key decision input);
  // a discarded set/run shows each card a notch smaller so the row still fits.
  const cardSize = group.length === 1 ? "lg" : "md";
  return (
    <ContextTooltip
      text={
        canDraw
          ? "Take one visible card here instead of drawing blind from the deck."
          : "The discard pile — its newest face-up group is takeable right after you discard."
      }
      className="relative"
    >
      {/* Offset backing cards convey that this is a stack of past discards. */}
      <div
        className="absolute rounded-lg bg-muted-foreground/15 border border-border"
        style={{ inset: 0, transform: "translate(5px, 5px)" }}
        aria-hidden
      />
      <div
        className="absolute rounded-lg bg-muted-foreground/10 border border-border"
        style={{ inset: 0, transform: "translate(2.5px, 2.5px)" }}
        aria-hidden
      />
      <div className="relative flex gap-0.5">
        {group.map((card, i) => (
          <button
            key={i}
            onClick={() => canDraw && onPickCard(i)}
            disabled={!canDraw}
            className={`rounded-lg transition-all outline-none ${
              canDraw
                ? "hover:-translate-y-1 cursor-pointer ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                : "cursor-default"
            }`}
            aria-label={canDraw ? `Draw ${card.rank} of ${card.suit}` : `Top discard: ${card.rank} of ${card.suit}`}
          >
            <PlayingCard card={toShellCard(card)} size={cardSize} />
          </button>
        ))}
      </div>
    </ContextTooltip>
  );
}

// ── DeckVisual ────────────────────────────────────────────────────────────

export function DeckVisual({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div
        className="w-20 h-28 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground/50 text-[10px]"
        aria-label="empty draw deck"
      >
        empty
      </div>
    );
  }
  const layers = Math.min(count, 5);
  const topIndex = layers - 1;

  // Sized to roughly match the large discard card so the two piles read as a pair,
  // while the green face-down backs keep the draw pile unmistakably distinct.
  return (
    <ContextTooltip
      text={`Draw deck — ${count} unknown card${count === 1 ? "" : "s"} left to draw blind.`}
    >
      <div
        className="relative w-20 h-28"
        aria-label={`draw deck with ${count} card${count === 1 ? "" : "s"} remaining`}
        role="img"
      >
      {Array.from({ length: layers }, (_, i) => {
        const isTop = i === topIndex;
        const depth = topIndex - i;
        return (
          <div
            key={i}
            className="pip-card-back absolute rounded-lg shadow-md"
            style={{
              width: 64,
              height: 90,
              top: 6 + depth * 3,
              left: 8 - depth * 4,
              zIndex: i,
              transform: `rotate(${depth * -2}deg)`,
            }}
          >
            {isTop && (
              <div className="w-full h-full flex items-center justify-center rounded-lg">
                <div className="w-[80%] h-[80%] rounded border border-white/30" />
              </div>
            )}
          </div>
        );
      })}
      </div>
    </ContextTooltip>
  );
}
