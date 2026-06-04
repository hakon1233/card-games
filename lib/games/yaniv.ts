import type { Card, Rank } from "./types";
import { buildDeck, shuffle } from "./blackjack";

export type YanivStatus = "in_progress" | "round_over" | "game_over";

export interface YanivSettings {
  yanivThreshold: number;
  scoreLimit: number;
  quickDraw: boolean;
}

export const DEFAULT_YANIV_SETTINGS: YanivSettings = {
  yanivThreshold: 7,
  scoreLimit: 200,
  quickDraw: false,
};

export interface YanivPlayer {
  id: string;
  name: string;
  isBot: boolean;
  hand: Card[];
  score: number;
  eliminated: boolean;
}

export interface YanivRoundResult {
  callerId: string;
  assaf: boolean;
  handTotals: Record<string, number>;
}

export interface YanivGameState {
  gameId: string;
  status: YanivStatus;
  players: YanivPlayer[];
  deck: Card[];
  discardPile: Card[];
  currentPlayerIndex: number;
  round: number;
  roundResult: YanivRoundResult | null;
  winnerId: string | null;
  settings: YanivSettings;
}

export type YanivAction =
  | { type: "DISCARD_AND_DRAW"; playerId: string; discardIndices: number[]; drawFromDiscard: boolean }
  | { type: "CALL_YANIV"; playerId: string }
  | { type: "NEXT_ROUND"; playerId: string };

const RANK_ORDER: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function yanivCardValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}

export function handTotal(hand: Card[]): number {
  return hand.reduce((sum, c) => sum + yanivCardValue(c.rank), 0);
}

export function canCallYaniv(hand: Card[], threshold = 7): boolean {
  return handTotal(hand) <= threshold;
}

export function isValidDiscard(cards: Card[]): boolean {
  if (cards.length === 0) return false;
  if (cards.length === 1) return true;
  if (cards.length === 2) return cards[0].rank === cards[1].rank;

  const allSameRank = cards.every((c) => c.rank === cards[0].rank);
  if (allSameRank) return true;

  // Straight: all same suit, consecutive ranks
  const allSameSuit = cards.every((c) => c.suit === cards[0].suit);
  if (!allSameSuit) return false;

  const indices = cards.map((c) => RANK_ORDER.indexOf(c.rank)).sort((a, b) => a - b);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) return false;
  }
  return true;
}

export function discardPileTop(state: YanivGameState): Card | null {
  return state.discardPile.length > 0
    ? state.discardPile[state.discardPile.length - 1]
    : null;
}

export function dealGame(
  gameId: string,
  playerDefs: { id: string; name: string; isBot: boolean }[],
  settings: YanivSettings = DEFAULT_YANIV_SETTINGS,
): YanivGameState {
  if (playerDefs.length < 2 || playerDefs.length > 6) {
    throw new Error("Yaniv requires 2–6 players");
  }
  const deck = shuffle(buildDeck());
  const handSize = 5;

  const players: YanivPlayer[] = playerDefs.map((p, i) => ({
    ...p,
    hand: deck.slice(i * handSize, (i + 1) * handSize),
    score: 0,
    eliminated: false,
  }));

  const remaining = deck.slice(playerDefs.length * handSize);
  const startCard = remaining[remaining.length - 1];
  const deckAfterDeal = remaining.slice(0, -1);

  return {
    gameId,
    status: "in_progress",
    players,
    deck: deckAfterDeal,
    discardPile: [startCard],
    currentPlayerIndex: 0,
    round: 1,
    roundResult: null,
    winnerId: null,
    settings,
  };
}

function applyScore(state: YanivGameState, callerId: string): YanivGameState {
  const callerIdx = state.players.findIndex((p) => p.id === callerId);
  const callerTotal = handTotal(state.players[callerIdx].hand);
  const { scoreLimit } = state.settings;

  const handTotals: Record<string, number> = {};
  state.players.forEach((p) => {
    if (!p.eliminated) handTotals[p.id] = handTotal(p.hand);
  });

  const assaf = state.players.some(
    (p) => p.id !== callerId && !p.eliminated && handTotal(p.hand) <= callerTotal,
  );

  const updatedPlayers = state.players.map((p) => {
    if (p.eliminated) return p;

    let delta: number;
    if (p.id === callerId) {
      delta = assaf ? 30 : 0;
    } else {
      delta = handTotal(p.hand);
    }

    let newScore = p.score + delta;
    if (newScore === 50) newScore = 25;
    else if (newScore === 100) newScore = 50;

    return { ...p, score: newScore, eliminated: newScore > scoreLimit };
  });

  const alive = updatedPlayers.filter((p) => !p.eliminated);
  const gameOver = alive.length <= 1;

  return {
    ...state,
    players: updatedPlayers,
    status: gameOver ? "game_over" : "round_over",
    roundResult: { callerId, assaf, handTotals },
    winnerId: gameOver ? (alive[0]?.id ?? null) : null,
  };
}

export function startNextRound(state: YanivGameState): YanivGameState {
  if (state.status !== "round_over") return state;

  const activePlayers = state.players.filter((p) => !p.eliminated);
  const deck = shuffle(buildDeck());
  const handSize = 5;

  let offset = 0;
  const players = state.players.map((p) => {
    if (p.eliminated) return { ...p, hand: [] };
    const hand = deck.slice(offset * handSize, (offset + 1) * handSize);
    offset++;
    return { ...p, hand };
  });

  const remaining = deck.slice(activePlayers.length * handSize);
  const startCard = remaining[remaining.length - 1];
  const newDeck = remaining.slice(0, -1);

  // Next starter: player after the caller
  const callerIdx = state.players.findIndex((p) => p.id === state.roundResult?.callerId);
  let nextFirst = (callerIdx + 1) % state.players.length;
  let safety = 0;
  while (state.players[nextFirst].eliminated && safety < state.players.length) {
    nextFirst = (nextFirst + 1) % state.players.length;
    safety++;
  }

  return {
    ...state,
    status: "in_progress",
    players,
    deck: newDeck,
    discardPile: [startCard],
    currentPlayerIndex: nextFirst,
    round: state.round + 1,
    roundResult: null,
  };
}

export function applyAction(state: YanivGameState, action: YanivAction): YanivGameState {
  if (action.type === "NEXT_ROUND") {
    return startNextRound(state);
  }

  if (state.status !== "in_progress") return state;

  const playerIdx = state.players.findIndex((p) => p.id === action.playerId);
  if (playerIdx !== state.currentPlayerIndex) return state;

  if (action.type === "CALL_YANIV") {
    if (!canCallYaniv(state.players[playerIdx].hand, state.settings.yanivThreshold)) return state;
    return applyScore(state, action.playerId);
  }

  if (action.type === "DISCARD_AND_DRAW") {
    const { discardIndices, drawFromDiscard } = action;
    const player = state.players[playerIdx];

    if (discardIndices.length === 0) return state;
    const discardedCards = discardIndices.map((i) => player.hand[i]);
    if (discardedCards.some((c) => !c)) return state;
    if (!isValidDiscard(discardedCards)) return state;

    const newHand = player.hand.filter((_, i) => !discardIndices.includes(i));

    // Record old top before discard (the card the player might want to pick up)
    const oldTop = discardPileTop(state);

    // Pile after discard: remove oldTop's slot if picking it up, else keep it
    let deck = [...state.deck];
    let discardPile: Card[];
    let drawnCard: Card;

    if (drawFromDiscard && oldTop) {
      // Give player the card that was on top before their discard;
      // pile becomes: everything under oldTop, plus their new discards
      discardPile = [...state.discardPile.slice(0, -1), ...discardedCards];
      drawnCard = oldTop;
    } else {
      discardPile = [...state.discardPile, ...discardedCards];

      if (deck.length === 0) {
        // Reshuffle discard pile into deck, keep new top
        const top = discardPile[discardPile.length - 1];
        deck = shuffle(discardPile.slice(0, -1));
        discardPile = [top];
      }

      if (deck.length === 0) return state;
      drawnCard = deck[deck.length - 1];
      deck = deck.slice(0, -1);
    }

    const updatedPlayers = state.players.map((p, i) =>
      i === playerIdx ? { ...p, hand: [...newHand, drawnCard] } : p,
    );

    // Advance to next non-eliminated player
    let nextIdx = (playerIdx + 1) % state.players.length;
    let skipped = 0;
    while (state.players[nextIdx].eliminated && skipped < state.players.length) {
      nextIdx = (nextIdx + 1) % state.players.length;
      skipped++;
    }

    return {
      ...state,
      players: updatedPlayers,
      deck,
      discardPile,
      currentPlayerIndex: nextIdx,
    };
  }

  return state;
}
