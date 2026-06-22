export const CARD_DECK_STORAGE_KEY = "pip-card-deck";

export const CARD_DECKS = ["two-color", "four-color"] as const;

export type CardDeck = (typeof CARD_DECKS)[number];

const LABELS: Record<CardDeck, string> = {
  "two-color": "Two-color",
  "four-color": "Four-color",
};

const DESCRIPTIONS: Record<CardDeck, string> = {
  "two-color": "Classic red & black suits",
  "four-color": "Each suit its own color — easier to tell apart",
};

export function coerceCardDeck(value: unknown): CardDeck | null {
  return typeof value === "string" && CARD_DECKS.includes(value as CardDeck)
    ? (value as CardDeck)
    : null;
}

export function cardDeckLabel(deck: CardDeck): string {
  return LABELS[deck];
}

export function cardDeckDescription(deck: CardDeck): string {
  return DESCRIPTIONS[deck];
}

/**
 * Resolve the deck colouring to use on first paint. A persisted choice always
 * wins; otherwise we fall back to the classic two-color deck. The four-color
 * deck is an opt-in accessibility aid (suits never rely on red/black alone),
 * so we never force it on automatically — the user enables it in Settings.
 */
export function getInitialCardDeck({
  getStoredValue,
}: {
  getStoredValue: (key: string) => string | null;
}): CardDeck {
  const stored = coerceCardDeck(getStoredValue(CARD_DECK_STORAGE_KEY));
  if (stored) return stored;
  return "two-color";
}
