import type { Card, Suit } from "./types";
import { buildDeck, shuffle } from "./blackjack";

export type CrazyEightsStatus = "waiting" | "in_progress" | "round_over";

export interface CrazyEightsPlayer {
  id: string;
  isBot: boolean;
  hand: Card[];
  roundWins: number;
}

export interface CrazyEightsState {
  gameId: string;
  status: CrazyEightsStatus;
  players: CrazyEightsPlayer[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  declaredSuit: Suit | null;
  winnerId: string | null;
}

export type CrazyEightsAction =
  | { type: "PLAY_CARD"; playerId: string; cardIndex: number; declaredSuit?: Suit }
  | { type: "DRAW_CARD"; playerId: string };

export function topCard(state: CrazyEightsState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

export function effectiveSuit(state: CrazyEightsState): Suit {
  return state.declaredSuit ?? topCard(state).suit;
}

export function isPlayable(card: Card, state: CrazyEightsState): boolean {
  if (card.rank === "8") return true;
  const top = topCard(state);
  const suit = effectiveSuit(state);
  return card.suit === suit || card.rank === top.rank;
}

export function playableCards(hand: Card[], state: CrazyEightsState): Card[] {
  return hand.filter((c) => isPlayable(c, state));
}

export function dealGame(
  gameId: string,
  playerIds: string[],
  botFlags: boolean[],
): CrazyEightsState {
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new Error("Crazy Eights requires 2–4 players");
  }

  let deck = shuffle(buildDeck());
  const handSize = 7;

  const players: CrazyEightsPlayer[] = playerIds.map((id, i) => ({
    id,
    isBot: botFlags[i] ?? false,
    hand: deck.slice(i * handSize, (i + 1) * handSize),
    roundWins: 0,
  }));

  deck = deck.slice(playerIds.length * handSize);

  // Flip first non-8 card to start discard pile; 8s go to deck bottom
  let startCard: Card | undefined;
  while (deck.length > 0) {
    const candidate = deck.shift()!;
    if (candidate.rank !== "8") {
      startCard = candidate;
      break;
    }
    deck.push(candidate);
  }

  if (!startCard) throw new Error("No valid start card found");

  return {
    gameId,
    status: "in_progress",
    players,
    deck,
    discardPile: [startCard],
    currentPlayerIndex: 0,
    declaredSuit: null,
    winnerId: null,
  };
}

function nextPlayerIndex(state: CrazyEightsState): number {
  return (state.currentPlayerIndex + 1) % state.players.length;
}

function reshuffleDiscardIntoDeck(state: CrazyEightsState): CrazyEightsState {
  if (state.discardPile.length <= 1) return state;
  const top = topCard(state);
  const reshuffled = shuffle(state.discardPile.slice(0, -1));
  return { ...state, deck: [...state.deck, ...reshuffled], discardPile: [top] };
}

export function applyPlayCard(
  state: CrazyEightsState,
  playerId: string,
  cardIndex: number,
  declaredSuit?: Suit,
): CrazyEightsState {
  if (state.status !== "in_progress") return state;

  const playerIdx = state.players.findIndex((p) => p.id === playerId);
  if (playerIdx !== state.currentPlayerIndex) return state;

  const player = state.players[playerIdx];
  const card = player.hand[cardIndex];

  if (!card || !isPlayable(card, state)) return state;
  if (card.rank === "8" && !declaredSuit) return state;

  const newHand = player.hand.filter((_, i) => i !== cardIndex);
  const isWon = newHand.length === 0;

  const updatedPlayers = state.players.map((p, i) => {
    if (i !== playerIdx) return p;
    return { ...p, hand: newHand, roundWins: isWon ? p.roundWins + 1 : p.roundWins };
  });

  return {
    ...state,
    players: updatedPlayers,
    discardPile: [...state.discardPile, card],
    currentPlayerIndex: isWon ? state.currentPlayerIndex : nextPlayerIndex(state),
    declaredSuit: card.rank === "8" ? (declaredSuit ?? null) : null,
    status: isWon ? "round_over" : "in_progress",
    winnerId: isWon ? playerId : null,
  };
}

export function applyDrawCard(
  state: CrazyEightsState,
  playerId: string,
): CrazyEightsState {
  if (state.status !== "in_progress") return state;

  const playerIdx = state.players.findIndex((p) => p.id === playerId);
  if (playerIdx !== state.currentPlayerIndex) return state;

  let s = state.deck.length === 0 ? reshuffleDiscardIntoDeck(state) : state;

  if (s.deck.length === 0) {
    // Nothing to draw — skip turn
    return { ...s, currentPlayerIndex: nextPlayerIndex(s) };
  }

  const deck = [...s.deck];
  const drawnCard = deck.pop()!;

  const updatedPlayers = s.players.map((p, i) =>
    i === playerIdx ? { ...p, hand: [...p.hand, drawnCard] } : p,
  );

  return {
    ...s,
    players: updatedPlayers,
    deck,
    currentPlayerIndex: nextPlayerIndex(s),
  };
}

export function applyAction(
  state: CrazyEightsState,
  action: CrazyEightsAction,
): CrazyEightsState {
  if (state.status !== "in_progress") return state;

  switch (action.type) {
    case "PLAY_CARD":
      return applyPlayCard(state, action.playerId, action.cardIndex, action.declaredSuit);
    case "DRAW_CARD":
      return applyDrawCard(state, action.playerId);
    default:
      return state;
  }
}
