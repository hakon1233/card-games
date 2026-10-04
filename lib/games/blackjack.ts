import { buildDeck, shuffle } from "./deck-utils";
import type { Rng } from "./engine";
import type { Card, Rank } from "./types";

export type BlackjackStatus =
  | "waiting"
  | "in_progress"
  | "player_bust"
  | "dealer_bust"
  | "player_win"
  | "dealer_win"
  | "push";

export interface BlackjackHand {
  playerId: string;
  isBot: boolean;
  cards: Card[];
}

export interface BlackjackState {
  gameId: string;
  status: BlackjackStatus;
  playerHand: BlackjackHand;
  /** The hole card is flagged hidden until the dealer's turn. */
  dealerHand: Card[];
  /** The draw pile; cards are drawn from the end. */
  deck: Card[];
  turn: "player" | "dealer" | "over";
  result?: "player_win" | "dealer_win" | "push";
}

export interface BlackjackAction {
  type: "HIT" | "STAND" | "START";
  playerId: string;
}

/** What the player may see: no draw pile; the dealer's hole card stays face-down (hidden). */
export type BlackjackPlayerView = Omit<BlackjackState, "deck">;

export function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}

export function handValue(cards: Card[]): number {
  const visible = cards.filter((c) => !c.hidden);
  let total = 0;
  let aces = 0;
  for (const card of visible) {
    total += cardValue(card.rank);
    if (card.rank === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards) === 21;
}

export function isBust(cards: Card[]): boolean {
  return handValue(cards) > 21;
}

/** Draw one card from the end of the deck (pop semantics). */
function drawCard(deck: Card[]): { card: Card; remaining: Card[] } {
  const remaining = [...deck];
  const card = remaining.pop()!;
  return { card, remaining };
}

/**
 * Deal the initial state. Always returns turn "player" with 48 cards remaining.
 * Blackjack detection is the caller's responsibility.
 */
function dealInitialState(
  gameId: string,
  playerId: string,
  rng: Rng = Math.random,
): BlackjackState {
  let deck = shuffle(buildDeck(), rng);

  const d1 = drawCard(deck); deck = d1.remaining;
  const d2 = drawCard(deck); deck = d2.remaining;
  const d3 = drawCard(deck); deck = d3.remaining;
  const d4 = drawCard(deck); deck = d4.remaining;

  return {
    gameId,
    status: "in_progress",
    playerHand: { playerId, isBot: false, cards: [d1.card, d3.card] },
    dealerHand: [d2.card, { ...d4.card, hidden: true }],
    deck,
    turn: "player",
  };
}

/** Deal a new game, settling naturals at once. */
export function deal(gameId: string, playerId: string, rng: Rng = Math.random): BlackjackState {
  const state = dealInitialState(gameId, playerId, rng);
  const playerBJ = isBlackjack(state.playerHand.cards);
  const revealedDealer = state.dealerHand.map((c) => ({ ...c, hidden: false }));
  const dealerBJ = isBlackjack(revealedDealer);

  if (!playerBJ && !dealerBJ) return state;

  if (playerBJ && dealerBJ) {
    return { ...state, dealerHand: revealedDealer, status: "push", turn: "over", result: "push" };
  }
  if (playerBJ) {
    return { ...state, dealerHand: revealedDealer, status: "player_win", turn: "over", result: "player_win" };
  }
  return { ...state, dealerHand: revealedDealer, status: "dealer_win", turn: "over", result: "dealer_win" };
}

function applyPlayerHit(state: BlackjackState): BlackjackState {
  if (state.turn !== "player") return state;

  const { card, remaining } = drawCard(state.deck);
  const newCards = [...state.playerHand.cards, card];

  if (isBust(newCards)) {
    return {
      ...state,
      playerHand: { ...state.playerHand, cards: newCards },
      dealerHand: state.dealerHand.map((c) => ({ ...c, hidden: false })),
      deck: remaining,
      turn: "over",
      status: "player_bust",
      result: "dealer_win",
    };
  }

  return {
    ...state,
    playerHand: { ...state.playerHand, cards: newCards },
    deck: remaining,
  };
}

function applyDealerTurn(state: BlackjackState): BlackjackState {
  let deck = state.deck;

  // Reveal the hole card BEFORE deciding to draw: the dealer must stand on
  // hard/soft 17+ computed over its COMPLETE hand, not just the visible up-card.
  // handValue() filters out hidden cards (for player-facing display), so the
  // draw loop must run against the revealed hand or it ignores the hole card.
  let dealerCards: Card[] = state.dealerHand.map((c) => ({ ...c, hidden: false }));
  while (handValue(dealerCards) < 17) {
    if (deck.length === 0) break;
    const { card, remaining } = drawCard(deck);
    deck = remaining;
    dealerCards = [...dealerCards, card];
  }

  const dealerTotal = handValue(dealerCards);
  const playerTotal = handValue(state.playerHand.cards);

  if (dealerTotal > 21) {
    return { ...state, dealerHand: dealerCards, deck, turn: "over", status: "dealer_bust", result: "player_win" };
  }
  if (playerTotal > dealerTotal) {
    return { ...state, dealerHand: dealerCards, deck, turn: "over", status: "player_win", result: "player_win" };
  }
  if (dealerTotal > playerTotal) {
    return { ...state, dealerHand: dealerCards, deck, turn: "over", status: "dealer_win", result: "dealer_win" };
  }
  return { ...state, dealerHand: dealerCards, deck, turn: "over", status: "push", result: "push" };
}

export function apply(
  state: BlackjackState,
  action: BlackjackAction,
  rng: Rng = Math.random,
): BlackjackState {
  if (action.type === "START") {
    return deal(state.gameId, action.playerId, rng);
  }
  if (state.turn === "over") return state;
  if (action.type === "HIT") return applyPlayerHit(state);
  if (action.type === "STAND") return applyDealerTurn({ ...state, turn: "dealer" });
  return state;
}

export function activePlayer(state: BlackjackState): string | null {
  return state.turn === "player" ? state.playerHand.playerId : null;
}

/** One seat, so the view is the same for any player id. */
export function playerView(state: BlackjackState): BlackjackPlayerView {
  const { gameId, status, playerHand, dealerHand, turn, result } = state;
  return { gameId, status, playerHand, dealerHand, turn, result };
}
