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

export interface YanivQuickDrawWindow {
  /** Player who just discarded and hasn't drawn yet. */
  discarderId: string;
  /** Freshly discarded cards sitting on top of the pile. */
  cards: Card[];
  /** The top group that existed before the discard (for expire draw-from-discard path). */
  topGroupBeforeDiscard: Card[];
  /** Original draw intent: draw from discard pile? */
  drawFromDiscard: boolean;
  /** Which card within the top group the discarder wanted (for expire path). */
  drawDiscardIndex: number | undefined;
}

export interface YanivGameState {
  gameId: string;
  status: YanivStatus;
  players: YanivPlayer[];
  deck: Card[];
  discardPile: Card[];
  /** How many cards at the end of discardPile form the most-recently-discarded group. */
  lastDiscardGroupCount: number;
  currentPlayerIndex: number;
  round: number;
  roundResult: YanivRoundResult | null;
  winnerId: string | null;
  settings: YanivSettings;
  /** Present when a quick-draw window is open (player discarded but hasn't drawn yet). */
  quickDrawWindow: YanivQuickDrawWindow | null;
}

export type YanivAction =
  | { type: "DISCARD_AND_DRAW"; playerId: string; discardIndices: number[]; drawFromDiscard: boolean; drawDiscardIndex?: number }
  | { type: "QUICK_DRAW_STEAL"; playerId: string }
  | { type: "QUICK_DRAW_EXPIRE" }
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

export type SelectionKind = "empty" | "single" | "pair" | "set" | "run" | "invalid";

export interface SelectionDescription {
  /** Whether the current selection is a legal discard. */
  valid: boolean;
  kind: SelectionKind;
  /** Human-readable combo name, e.g. "Pair of 7s", "Run of 3 (5–7)". */
  label: string;
  /** Total Yaniv points of the selected cards. */
  points: number;
  count: number;
}

/**
 * Describe a card selection for live, pre-commit UI feedback: names the combo,
 * reports its point value, and states whether it is a legal discard. Pure —
 * safe to call on every render as the player builds a selection.
 */
export function describeSelection(cards: Card[]): SelectionDescription {
  const points = cards.reduce((sum, c) => sum + yanivCardValue(c.rank), 0);
  const count = cards.length;

  if (count === 0) {
    return { valid: false, kind: "empty", label: "No cards selected", points: 0, count: 0 };
  }

  if (!isValidDiscard(cards)) {
    return { valid: false, kind: "invalid", label: "Not a legal discard", points, count };
  }

  if (count === 1) {
    return { valid: true, kind: "single", label: `Single ${cards[0].rank}`, points, count };
  }

  const allSameRank = cards.every((c) => c.rank === cards[0].rank);
  if (allSameRank) {
    if (count === 2) {
      return { valid: true, kind: "pair", label: `Pair of ${cards[0].rank}s`, points, count };
    }
    return { valid: true, kind: "set", label: `Set of ${count} ${cards[0].rank}s`, points, count };
  }

  // Same-suit straight (isValidDiscard already guaranteed legality).
  const sorted = [...cards].sort(
    (a, b) => RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank),
  );
  const low = sorted[0].rank;
  const high = sorted[sorted.length - 1].rank;
  return { valid: true, kind: "run", label: `Run of ${count} (${low}–${high})`, points, count };
}

export function discardPileTop(state: YanivGameState): Card | null {
  return state.discardPile.length > 0
    ? state.discardPile[state.discardPile.length - 1]
    : null;
}

/** Returns the cards that form the most-recently-discarded group (clickable for drawing). */
export function getDiscardTopGroup(state: YanivGameState): Card[] {
  const count = Math.min(state.lastDiscardGroupCount ?? 1, state.discardPile.length);
  return state.discardPile.slice(-count);
}

/**
 * Returns true if `card` can be added to `selected` and still potentially form a valid discard.
 * Used to compute disabled state for hand cards during selection.
 */
export function canAddToSelection(selected: Card[], card: Card): boolean {
  if (selected.length === 0) return true;

  const combined = [...selected, card];
  if (isValidDiscard(combined)) return true;

  // Could still become a same-rank set
  if (selected.every((c) => c.rank === selected[0].rank) && card.rank === selected[0].rank) return true;

  // Could still extend a straight: all existing same suit, consecutive, and card extends by one
  const allSameSuit = selected.every((c) => c.suit === selected[0].suit);
  if (allSameSuit && card.suit === selected[0].suit) {
    const indices = selected.map((c) => RANK_ORDER.indexOf(c.rank)).sort((a, b) => a - b);
    const cardIdx = RANK_ORDER.indexOf(card.rank);
    const isConsecutive = indices.every((v, i) => i === 0 || v === indices[i - 1] + 1);
    if (isConsecutive && (cardIdx === indices[0] - 1 || cardIdx === indices[indices.length - 1] + 1)) return true;
  }

  return false;
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
    lastDiscardGroupCount: 1,
    currentPlayerIndex: 0,
    round: 1,
    roundResult: null,
    winnerId: null,
    settings,
    quickDrawWindow: null,
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

  const opponentTotals = state.players
    .filter((p) => p.id !== callerId && !p.eliminated)
    .map((p) => ({ id: p.id, total: handTotal(p.hand) }));
  const lowestOpponentTotal = Math.min(...opponentTotals.map((p) => p.total));
  const assafWinnerIds = new Set(
    opponentTotals
      .filter((p) => p.total === lowestOpponentTotal && p.total <= callerTotal)
      .map((p) => p.id),
  );
  const assaf = assafWinnerIds.size > 0;

  const updatedPlayers = state.players.map((p) => {
    if (p.eliminated) return p;

    let delta: number;
    if (p.id === callerId) {
      delta = assaf ? 30 : 0;
    } else if (assafWinnerIds.has(p.id)) {
      delta = 0;
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
    lastDiscardGroupCount: 1,
    currentPlayerIndex: nextFirst,
    round: state.round + 1,
    roundResult: null,
    quickDrawWindow: null,
  };
}

function advanceToNextPlayer(players: YanivPlayer[], fromIdx: number): number {
  const n = players.length;
  let nextIdx = (fromIdx + 1) % n;
  let skipped = 0;
  while (players[nextIdx].eliminated && skipped < n) {
    nextIdx = (nextIdx + 1) % n;
    skipped++;
  }
  return nextIdx;
}

export function applyAction(state: YanivGameState, action: YanivAction): YanivGameState {
  if (action.type === "NEXT_ROUND") {
    return startNextRound(state);
  }

  if (action.type === "QUICK_DRAW_STEAL") {
    if (!state.quickDrawWindow || state.status !== "in_progress") return state;
    const win = state.quickDrawWindow;
    const stealerIdx = state.players.findIndex((p) => p.id === action.playerId);
    const discarderIdx = state.players.findIndex((p) => p.id === win.discarderId);
    if (stealerIdx === -1 || discarderIdx === -1 || stealerIdx === discarderIdx) return state;
    if (state.players[stealerIdx].eliminated) return state;

    // Stealer takes the freshly discarded cards from the pile top
    const pileWithoutStolen = state.discardPile.slice(0, -win.cards.length);

    // Discarder is forced to draw from deck
    let deck = [...state.deck];
    let discardPile = pileWithoutStolen;
    if (deck.length === 0) {
      const top = discardPile[discardPile.length - 1];
      deck = shuffle(discardPile.slice(0, -1));
      discardPile = top ? [top] : [];
    }
    if (deck.length === 0) return state;
    const drawnCard = deck[deck.length - 1];
    deck = deck.slice(0, -1);

    const updatedPlayers = state.players.map((p, i) => {
      if (i === stealerIdx) return { ...p, hand: [...p.hand, ...win.cards] };
      if (i === discarderIdx) return { ...p, hand: [...p.hand, drawnCard] };
      return p;
    });

    const nextIdx = advanceToNextPlayer(state.players, discarderIdx);
    return {
      ...state,
      players: updatedPlayers,
      deck,
      discardPile,
      lastDiscardGroupCount: Math.max(1, discardPile.length > 0 ? 1 : 0),
      currentPlayerIndex: nextIdx,
      quickDrawWindow: null,
    };
  }

  if (action.type === "QUICK_DRAW_EXPIRE") {
    if (!state.quickDrawWindow || state.status !== "in_progress") return state;
    const win = state.quickDrawWindow;
    const discarderIdx = state.players.findIndex((p) => p.id === win.discarderId);
    if (discarderIdx === -1) return state;

    let deck = [...state.deck];
    let discardPile = [...state.discardPile];
    let drawnCard: Card;

    if (win.drawFromDiscard && win.topGroupBeforeDiscard.length > 0) {
      // Honour the discarder's original intent: take a card from the pre-discard top group
      const idx = win.drawDiscardIndex ?? (win.topGroupBeforeDiscard.length - 1);
      const pickedCard = win.topGroupBeforeDiscard[idx];
      if (!pickedCard) return state;

      // The fresh discards are now on top of the pile; the topGroupBeforeDiscard cards
      // are underneath. Reconstruct: pile = base + remaining group + fresh discards
      const pileBase = discardPile.slice(0, -(win.topGroupBeforeDiscard.length + win.cards.length));
      const remainingGroup = win.topGroupBeforeDiscard.filter((_, i) => i !== idx);
      discardPile = [...pileBase, ...remainingGroup, ...win.cards];
      drawnCard = pickedCard;
    } else {
      // Draw from deck
      if (deck.length === 0) {
        const top = discardPile[discardPile.length - 1];
        deck = shuffle(discardPile.slice(0, -1));
        discardPile = top ? [top] : [];
      }
      if (deck.length === 0) return state;
      drawnCard = deck[deck.length - 1];
      deck = deck.slice(0, -1);
    }

    const updatedPlayers = state.players.map((p, i) =>
      i === discarderIdx ? { ...p, hand: [...p.hand, drawnCard] } : p,
    );

    const nextIdx = advanceToNextPlayer(state.players, discarderIdx);
    return {
      ...state,
      players: updatedPlayers,
      deck,
      discardPile,
      lastDiscardGroupCount: win.cards.length,
      currentPlayerIndex: nextIdx,
      quickDrawWindow: null,
    };
  }

  if (state.status !== "in_progress") return state;

  const playerIdx = state.players.findIndex((p) => p.id === action.playerId);
  if (playerIdx !== state.currentPlayerIndex) return state;

  if (action.type === "CALL_YANIV") {
    if (!canCallYaniv(state.players[playerIdx].hand, state.settings.yanivThreshold)) return state;
    return applyScore(state, action.playerId);
  }

  if (action.type === "DISCARD_AND_DRAW") {
    const { discardIndices, drawFromDiscard, drawDiscardIndex } = action;
    const player = state.players[playerIdx];

    if (discardIndices.length === 0) return state;
    const discardedCards = discardIndices.map((i) => player.hand[i]);
    if (discardedCards.some((c) => !c)) return state;
    if (!isValidDiscard(discardedCards)) return state;

    const newHand = player.hand.filter((_, i) => !discardIndices.includes(i));
    const topGroup = getDiscardTopGroup(state);

    // When quick-draw is enabled, open a 2-second window before the draw step
    if (state.settings.quickDraw) {
      const updatedPlayers = state.players.map((p, i) =>
        i === playerIdx ? { ...p, hand: newHand } : p,
      );
      return {
        ...state,
        players: updatedPlayers,
        discardPile: [...state.discardPile, ...discardedCards],
        lastDiscardGroupCount: discardedCards.length,
        quickDrawWindow: {
          discarderId: action.playerId,
          cards: discardedCards,
          topGroupBeforeDiscard: topGroup,
          drawFromDiscard,
          drawDiscardIndex,
        },
      };
    }

    let deck = [...state.deck];
    let discardPile: Card[];
    let drawnCard: Card;

    if (drawFromDiscard && topGroup.length > 0) {
      // Default to last card in group (top visual card) when no index given
      const idx = drawDiscardIndex ?? (topGroup.length - 1);
      const pickedCard = topGroup[idx];
      if (!pickedCard) return state;

      // Rebuild pile: base (below group) + remaining group cards + new discards
      const groupWithoutPicked = topGroup.filter((_, i) => i !== idx);
      const pileBase = state.discardPile.slice(0, -state.lastDiscardGroupCount);
      discardPile = [...pileBase, ...groupWithoutPicked, ...discardedCards];
      drawnCard = pickedCard;
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

    const nextIdx = advanceToNextPlayer(state.players, playerIdx);

    return {
      ...state,
      players: updatedPlayers,
      deck,
      discardPile,
      lastDiscardGroupCount: discardedCards.length,
      currentPlayerIndex: nextIdx,
      quickDrawWindow: null,
    };
  }

  return state;
}
