"use client";

// Your hand and your moves: select cards, see what the selection is worth, discard and draw,
// or call Yaniv.

import { Button } from "@/components/ui/button";
import { CardHand } from "@/components/game/card-hand";
import { toShellCard } from "@/lib/games/shell-types";
import type { Card, Suit } from "@/lib/games/types";
import {
  canAddToSelection,
  canCallYaniv,
  type SelectionDescription,
  type YanivPlayer,
} from "@/lib/games/yaniv";
import { getYanivHandReadout } from "@/lib/games/yaniv-readout";
import { ContextTooltip } from "./context-tooltip";
import { useYanivTableFormFactor } from "./player-ring";

export function HandPanel({
  player,
  threshold,
  isMyTurn,
  selected,
  selectedCards,
  selection,
  canDiscard,
  topGroup,
  onToggleCard,
  onCallYaniv,
  onDiscardAndDraw,
}: {
  player: YanivPlayer;
  threshold: number;
  isMyTurn: boolean;
  selected: number[];
  selectedCards: Card[];
  selection: SelectionDescription;
  canDiscard: boolean;
  /** The discard pile's newest group, which you may draw from. */
  topGroup: Card[];
  onToggleCard: (index: number) => void;
  onCallYaniv: () => void;
  onDiscardAndDraw: (drawFromDiscard: boolean) => void;
}) {
  const formFactor = useYanivTableFormFactor();
  const handReadout = getYanivHandReadout(player.hand, threshold);
  const canYaniv = isMyTurn && canCallYaniv(player.hand, threshold);
  const cardDisabled = player.hand.map((card, i) => {
    if (!isMyTurn) return true;
    if (selected.includes(i)) return false;
    return !canAddToSelection(selectedCards, card);
  });

  return (
    <>
      {/* Human player hand */}
      <div className="pip-seat-panel rounded-xl p-3">
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-foreground text-sm font-medium">
            {player.name}
            {isMyTurn && <span className="ml-2 text-primary text-xs">— your turn</span>}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2 text-xs tabular-nums">
            <span className="text-muted-foreground">Score: {player.score}</span>
            <ContextTooltip
              text={`Your hand total is ${handReadout.total}. You can call Yaniv at ${handReadout.threshold} or less.`}
              className="rounded-md"
            >
              <span
                className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-black/15 px-2 py-1 font-medium text-foreground"
                aria-label={`Hand total ${handReadout.total}. Yaniv threshold ${handReadout.threshold}. ${
                  handReadout.withinThreshold
                    ? "You can call Yaniv on your turn."
                    : `${handReadout.distanceToThreshold} points over the Yaniv threshold.`
                }`}
              >
                <span>Hand {handReadout.total}</span>
                <span className="text-muted-foreground">/</span>
                <span
                  className={
                    handReadout.withinThreshold ? "text-emerald-300" : "text-amber-300"
                  }
                >
                  {handReadout.withinThreshold
                    ? "Yaniv ready"
                    : `${handReadout.distanceToThreshold} over Yaniv`}
                </span>
              </span>
            </ContextTooltip>
          </div>
        </div>
        <CardHand
          cards={player.hand.map((card) => toShellCard(card))}
          gameType="yaniv"
          formFactor={formFactor}
          selectedIndices={selected}
          disabledIndices={cardDisabled.map((isDisabled, i) => (isDisabled ? i : -1)).filter((i) => i >= 0)}
          onCardClick={(_, i) => onToggleCard(i)}
          cardClassName={(_, i) => {
            const isSelected = selected.includes(i);
            const isDisabled = cardDisabled[i];
            return isDisabled
              ? "opacity-35 cursor-not-allowed"
              : isSelected
                ? "-translate-y-4 card-selected-glow cursor-pointer"
                : isMyTurn
                  ? "hover:-translate-y-1 cursor-pointer"
                  : "cursor-default";
          }}
        />
      </div>

      {/* Action buttons */}
      {isMyTurn && (
        <div className="flex flex-col gap-2">
          {canYaniv && (
            <ContextTooltip
              text="End the round now. If another player has an equal or lower hand, you take the Assaf penalty."
              className="w-full"
            >
              <Button
                onClick={onCallYaniv}
                className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold"
              >
                Call Yaniv! (hand = {handReadout.total})
              </Button>
            </ContextTooltip>
          )}
          {selected.length > 0 && (
            <SelectionSummary cards={selectedCards} selection={selection} />
          )}
          <div className="flex gap-2">
            <ContextTooltip
              text="Discard your selected legal set, then draw one unknown card from the deck."
              className="flex-1 min-w-0"
            >
              <Button
                onClick={() => onDiscardAndDraw(false)}
                disabled={!canDiscard}
                className="w-full whitespace-normal text-center leading-tight py-2"
                variant="default"
              >
                Discard &amp; Draw from Deck
              </Button>
            </ContextTooltip>
            <ContextTooltip
              text="Discard your selected legal set, then take one visible card from the top discard group."
              className="flex-1 min-w-0"
            >
              <Button
                onClick={() => onDiscardAndDraw(true)}
                disabled={!canDiscard || topGroup.length === 0}
                className="w-full"
                variant="outline"
              >
                Discard &amp; Take{" "}
                {topGroup.length > 0
                  ? `${topGroup[topGroup.length - 1].rank}${suitSymbol(topGroup[topGroup.length - 1].suit)}`
                  : "pile"}
              </Button>
            </ContextTooltip>
          </div>
          {selected.length === 0 && !canYaniv && (
            <p className="text-muted-foreground text-xs text-center">
              Tap a card (or cards) to select, then discard
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ── SelectionSummary ──────────────────────────────────────────────────────
// Running, pre-commit feedback: what's selected, the combo name, its point
// value, and whether it's a legal discard — shown live before the player commits.

function SelectionSummary({
  cards,
  selection,
}: {
  cards: Card[];
  selection: SelectionDescription;
}) {
  const legal = selection.valid;

  return (
    <div
      className={`rounded-lg border px-3 py-2 transition-colors ${
        legal
          ? "border-primary/50 bg-primary/10"
          : "border-destructive/50 bg-destructive/10"
      }`}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {cards.map((c, i) => (
            <span
              key={i}
              className={`inline-flex items-center rounded-md bg-card border border-border px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                c.suit === "hearts" || c.suit === "diamonds"
                  ? "text-red-500"
                  : "text-foreground"
              }`}
            >
              {c.rank}
              {suitSymbol(c.suit)}
            </span>
          ))}
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
          {selection.points} pts
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium">
        <span aria-hidden className={legal ? "text-primary" : "text-destructive"}>
          {legal ? "✓" : "✗"}
        </span>
        <span className={legal ? "text-foreground" : "text-destructive"}>
          {legal ? selection.label : "Not a legal discard"}
        </span>
        {legal && (
          <span className="text-muted-foreground">— ready to discard</span>
        )}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SUIT_SYMBOLS: Record<Suit, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}
