// Live feedback on the cards you have selected, before you discard them.

import type { Card, Suit } from "@/lib/games/types";
import type { SelectionDescription } from "@/lib/games/yaniv";

// ── SelectionSummary ──────────────────────────────────────────────────────
// Running, pre-commit feedback: what's selected, the combo name, its point
// value, and whether it's a legal discard — shown live before the player commits.

export function SelectionSummary({
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

export function suitSymbol(suit: Suit): string {
  return SUIT_SYMBOLS[suit];
}
