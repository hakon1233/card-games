import type { Card } from "./types";

type SortableCard = Pick<Card, "rank" | "suit">;

export type SortStrategy =
  | "none"
  | "rank-asc"
  | "rank-desc"
  | "suit-then-rank"
  | "rank-then-suit"
  | "color-then-rank"
  | "value-asc"
  | "value-desc";

export const SORT_LABELS: Record<SortStrategy, string> = {
  none: "Dealt order",
  "rank-asc": "Rank: A to K",
  "rank-desc": "Rank: K to A",
  "suit-then-rank": "Suit, then rank",
  "rank-then-suit": "Rank groups",
  "color-then-rank": "Color, then rank",
  "value-asc": "Value: low to high",
  "value-desc": "Value: high to low",
};

export const GAME_DEFAULT_SORT: Record<string, SortStrategy> = {
  blackjack: "rank-asc",
  go_fish: "rank-then-suit",
  crazy_eights: "suit-then-rank",
  yaniv: "value-asc",
};

const SORT_STRATEGIES: SortStrategy[] = [
  "none",
  "rank-asc",
  "rank-desc",
  "suit-then-rank",
  "rank-then-suit",
  "color-then-rank",
  "value-asc",
  "value-desc",
];

export const ALL_SORT_STRATEGIES = SORT_STRATEGIES;

const RANK_ORDER = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUIT_ORDER = ["spades", "hearts", "diamonds", "clubs"];

function rankOrder(card: SortableCard) {
  return RANK_ORDER.indexOf(card.rank);
}

function suitOrder(card: SortableCard) {
  return SUIT_ORDER.indexOf(card.suit);
}

function colorOrder(card: SortableCard) {
  return card.suit === "spades" || card.suit === "clubs" ? 0 : 1;
}

function gameValue(card: SortableCard, gameType: string) {
  if (String(card.rank) === "Joker") return 0;

  if (gameType === "yaniv") {
    if (card.rank === "A") return 1;
    if (["J", "Q", "K"].includes(card.rank)) return 10;
    return Number(card.rank);
  }

  if (gameType === "blackjack") {
    if (card.rank === "A") return 11;
    if (["J", "Q", "K"].includes(card.rank)) return 10;
    return Number(card.rank);
  }

  return rankOrder(card) + 1;
}

function compareThen(...comparisons: number[]) {
  return comparisons.find((value) => value !== 0) ?? 0;
}

function compareCards(a: SortableCard, b: SortableCard, strategy: SortStrategy, gameType: string) {
  switch (strategy) {
    case "none":
      return 0;
    case "rank-asc":
      return compareThen(rankOrder(a) - rankOrder(b), suitOrder(a) - suitOrder(b));
    case "rank-desc":
      return compareThen(rankOrder(b) - rankOrder(a), suitOrder(a) - suitOrder(b));
    case "suit-then-rank": {
      if (gameType === "crazy_eights") {
        const aWild = a.rank === "8";
        const bWild = b.rank === "8";
        if (aWild !== bWild) return aWild ? 1 : -1;
      }
      return compareThen(suitOrder(a) - suitOrder(b), rankOrder(a) - rankOrder(b));
    }
    case "rank-then-suit":
      return compareThen(rankOrder(a) - rankOrder(b), suitOrder(a) - suitOrder(b));
    case "color-then-rank":
      return compareThen(
        colorOrder(a) - colorOrder(b),
        rankOrder(a) - rankOrder(b),
        suitOrder(a) - suitOrder(b),
      );
    case "value-asc":
      return compareThen(gameValue(a, gameType) - gameValue(b, gameType), rankOrder(a) - rankOrder(b), suitOrder(a) - suitOrder(b));
    case "value-desc":
      return compareThen(gameValue(b, gameType) - gameValue(a, gameType), rankOrder(b) - rankOrder(a), suitOrder(a) - suitOrder(b));
  }
}

export function sortCardsWithOriginalIndices<T extends SortableCard>(
  cards: T[],
  strategy: SortStrategy,
  gameType: string,
): { card: T; originalIndex: number }[] {
  return cards
    .map((card, originalIndex) => ({ card, originalIndex }))
    .sort((a, b) =>
      compareThen(
        compareCards(a.card, b.card, strategy, gameType),
        a.originalIndex - b.originalIndex,
      ),
    );
}

export function sortCards<T extends SortableCard>(
  cards: T[],
  strategy: SortStrategy,
  gameType: string,
): T[] {
  if (strategy === "none") return [...cards];
  return sortCardsWithOriginalIndices(cards, strategy, gameType).map(({ card }) => card);
}
