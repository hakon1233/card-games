"use client";

import { Palette, SwatchBook } from "lucide-react";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";

import {
  CARD_DECK_STORAGE_KEY,
  CARD_DECKS,
  cardDeckDescription,
  cardDeckLabel,
  getInitialCardDeck,
  type CardDeck,
} from "@/lib/card-deck-preferences";

const ICONS = {
  "two-color": Palette,
  "four-color": SwatchBook,
} satisfies Record<CardDeck, ComponentType<{ className?: string; "aria-hidden"?: boolean }>>;

function readInitialDeck(): CardDeck {
  if (typeof window === "undefined") return "two-color";
  return getInitialCardDeck({
    getStoredValue: (key) => window.localStorage.getItem(key),
  });
}

function applyCardDeck(deck: CardDeck) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.cardDeck = deck;
}

// The persisted deck lives in localStorage — a client-only value, so the hook
// must stay hydration-safe.
//
// GAM-87 first moved this to `useSyncExternalStore` to silence the hydration
// *warning*: `getServerSnapshot` returned the "two-color" fallback to match the
// server HTML, and `getSnapshot` read localStorage for the real value. That
// killed the warning but left the original user-facing bug (GAM-94): after a
// reload with `four-color` persisted, the toggle stayed stuck on "two-color".
// `useSyncExternalStore`'s post-hydration re-render to the client snapshot did
// not flip the value the control binds to, so `aria-pressed` lied about the
// active deck — the very thing colour-blind users rely on.
//
// The reliable, canonical pattern (same one next-themes uses) is plain
// `useState` + a post-mount `useEffect`: render the "two-color" fallback on the
// server AND on the client's first paint (so hydration matches — no warning),
// then adopt the persisted value in an effect that runs after hydration. The
// state update guarantees a re-render, so the displayed selected control always
// reflects the persisted deck on first paint after reload.
export function useCardDeck() {
  const [deck, setDeck] = useState<CardDeck>("two-color");

  // Adopt the persisted deck once, after hydration. Runs after the server-
  // matching first paint, so it re-renders the control onto the real value
  // without a hydration mismatch.
  useEffect(() => {
    setDeck(readInitialDeck());
  }, []);

  useEffect(() => {
    applyCardDeck(deck);
  }, [deck]);

  function updateDeck(next: CardDeck) {
    setDeck(next);
    try {
      window.localStorage.setItem(CARD_DECK_STORAGE_KEY, next);
    } catch {
      // Non-critical preference persistence.
    }
  }

  return [deck, updateDeck] as const;
}

/**
 * Sets the persisted deck colouring on the document as early as possible so the
 * very first cards paint with the user's chosen channel (no red/black flash for
 * four-color users). Render once near the app root.
 */
export function CardDeckProvider() {
  useEffect(() => {
    applyCardDeck(readInitialDeck());
  }, []);

  return null;
}

export function CardDeckControl({
  value,
  onChange,
}: {
  value: CardDeck;
  onChange: (deck: CardDeck) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {CARD_DECKS.map((deck) => {
        const Icon = ICONS[deck];
        const selected = value === deck;
        return (
          <button
            key={deck}
            type="button"
            onClick={() => onChange(deck)}
            className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors ${
              selected
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            aria-pressed={selected}
            title={`${cardDeckLabel(deck)} deck — ${cardDeckDescription(deck)}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            <span>{cardDeckLabel(deck)}</span>
          </button>
        );
      })}
    </div>
  );
}
