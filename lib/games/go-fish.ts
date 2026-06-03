import type { Card, Rank, Suit } from "./types";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export interface GoFishPlayer {
  id: string;
  name: string;
  isBot: boolean;
  hand: Card[];
  books: Rank[];
  /** Bot tracking: which opponents are known to hold specific ranks */
  knownOpponentCards: Record<string, Rank[]>;
}

export type GoFishStatus = "waiting" | "in_progress" | "over";

export interface GoFishAskAction {
  type: "ASK";
  playerId: string;
  targetPlayerId: string;
  rank: Rank;
}

export type GoFishAction = GoFishAskAction;

export type AskOutcome =
  | "gave_cards"    // target had the rank; all matching cards transferred; asker goes again
  | "go_fish"       // target didn't have it; drew from deck (no rank match); turn passes
  | "go_fish_lucky"; // target didn't have it; drew matching rank; asker goes again

export interface GoFishEvent {
  askingPlayerId: string;
  targetPlayerId: string;
  rank: Rank;
  outcome: AskOutcome;
  transferCount: number; // cards transferred from target (>0 only for gave_cards)
  drew: Card | null;     // card drawn from deck (null if target gave cards or deck was empty)
}

export interface GoFishGameState {
  gameId: string;
  status: GoFishStatus;
  players: GoFishPlayer[];
  deck: Card[];
  currentPlayerIndex: number;
  lastEvent: GoFishEvent | null;
  winners: string[]; // playerIds; may be >1 on tie
}

export type GoFishPublicState = Omit<GoFishGameState, "deck" | "players"> & {
  deckSize: number;
  players: (Omit<GoFishPlayer, "hand" | "knownOpponentCards"> & { handSize: number })[];
  ownHand: Card[];
};

export type GoFishClientMessage =
  | { type: "JOIN"; playerId: string; playerName: string }
  | { type: "START" }
  | { type: "ASK"; playerId: string; targetPlayerId: string; rank: Rank };

export type GoFishServerMessage =
  | { type: "STATE_UPDATE"; state: GoFishPublicState }
  | { type: "PLAYER_JOINED"; playerId: string; playerName: string }
  | { type: "GAME_OVER"; winners: string[] };

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function extractBooks(player: GoFishPlayer): GoFishPlayer {
  const counts = new Map<Rank, number>();
  for (const card of player.hand) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }
  const newBooks = RANKS.filter((r) => (counts.get(r) ?? 0) === 4);
  if (newBooks.length === 0) return player;
  return {
    ...player,
    hand: player.hand.filter((c) => !newBooks.includes(c.rank)),
    books: [...player.books, ...newBooks],
  };
}

function totalBooks(players: GoFishPlayer[]): number {
  return players.reduce((sum, p) => sum + p.books.length, 0);
}

function computeWinners(players: GoFishPlayer[]): string[] {
  const max = Math.max(...players.map((p) => p.books.length));
  return players.filter((p) => p.books.length === max).map((p) => p.id);
}

function isOver(state: GoFishGameState): boolean {
  return state.deck.length === 0 || totalBooks(state.players) === 13;
}

function propagateBotKnowledge(
  players: GoFishPlayer[],
  event: GoFishEvent
): GoFishPlayer[] {
  return players.map((p) => {
    if (!p.isBot) return p;
    const known: Record<string, Rank[]> = {};
    for (const [k, v] of Object.entries(p.knownOpponentCards)) {
      known[k] = [...v];
    }

    if (event.outcome === "gave_cards") {
      // Target gave away event.rank — they no longer have it
      known[event.targetPlayerId] = (known[event.targetPlayerId] ?? []).filter(
        (r) => r !== event.rank
      );
      // Asker now has event.rank (if this bot isn't the asker, track it)
      if (p.id !== event.askingPlayerId) {
        const existing = known[event.askingPlayerId] ?? [];
        if (!existing.includes(event.rank)) {
          known[event.askingPlayerId] = [...existing, event.rank];
        }
      }
    }

    if (event.outcome === "go_fish" || event.outcome === "go_fish_lucky") {
      // Target confirmed not to have event.rank
      known[event.targetPlayerId] = (known[event.targetPlayerId] ?? []).filter(
        (r) => r !== event.rank
      );
      // Asker drew a matching card — all observers know asker has that rank
      if (event.outcome === "go_fish_lucky" && event.drew && p.id !== event.askingPlayerId) {
        const existing = known[event.askingPlayerId] ?? [];
        if (!existing.includes(event.drew.rank)) {
          known[event.askingPlayerId] = [...existing, event.drew.rank];
        }
      }
    }

    return { ...p, knownOpponentCards: known };
  });
}

export function dealGoFish(
  gameId: string,
  playerDefs: { id: string; name: string; isBot: boolean }[]
): GoFishGameState {
  const handSize = playerDefs.length >= 4 ? 5 : 7;
  const deck = shuffleDeck(buildDeck());

  const players: GoFishPlayer[] = playerDefs.map((p) => ({
    ...p,
    hand: [],
    books: [],
    knownOpponentCards: {},
  }));

  for (let i = 0; i < handSize; i++) {
    for (const player of players) {
      player.hand.push(deck.pop()!);
    }
  }

  return {
    gameId,
    status: "in_progress",
    players: players.map(extractBooks),
    deck,
    currentPlayerIndex: 0,
    lastEvent: null,
    winners: [],
  };
}

export function applyAsk(
  state: GoFishGameState,
  action: GoFishAskAction
): GoFishGameState {
  if (state.status !== "in_progress") return state;

  const askingIndex = state.players.findIndex((p) => p.id === action.playerId);
  if (askingIndex !== state.currentPlayerIndex) return state;

  const asker = state.players[askingIndex];
  // Asker must hold at least one card of the requested rank
  if (!asker.hand.some((c) => c.rank === action.rank)) return state;

  const targetIndex = state.players.findIndex((p) => p.id === action.targetPlayerId);
  if (targetIndex === -1 || targetIndex === askingIndex) return state;

  let players = state.players.map((p) => ({
    ...p,
    hand: [...p.hand],
    books: [...p.books],
  }));
  let deck = [...state.deck];
  let nextPlayerIndex: number;
  let outcome: AskOutcome;
  let transferCount: number;
  let drew: Card | null = null;

  const matching = players[targetIndex].hand.filter((c) => c.rank === action.rank);

  if (matching.length > 0) {
    outcome = "gave_cards";
    transferCount = matching.length;
    players[targetIndex].hand = players[targetIndex].hand.filter(
      (c) => c.rank !== action.rank
    );
    players[askingIndex].hand = [...players[askingIndex].hand, ...matching];
    players[askingIndex] = extractBooks(players[askingIndex]);
    nextPlayerIndex = askingIndex; // extra turn for successful ask
  } else if (deck.length > 0) {
    drew = deck.pop()!;
    players[askingIndex].hand = [...players[askingIndex].hand, drew];
    players[askingIndex] = extractBooks(players[askingIndex]);
    if (drew.rank === action.rank) {
      outcome = "go_fish_lucky";
      transferCount = 1;
      nextPlayerIndex = askingIndex; // lucky draw = extra turn
    } else {
      outcome = "go_fish";
      transferCount = 0;
      nextPlayerIndex = (askingIndex + 1) % players.length;
    }
  } else {
    // Deck is empty — no draw
    outcome = "go_fish";
    transferCount = 0;
    nextPlayerIndex = (askingIndex + 1) % players.length;
  }

  const event: GoFishEvent = {
    askingPlayerId: action.playerId,
    targetPlayerId: action.targetPlayerId,
    rank: action.rank,
    outcome,
    transferCount,
    drew,
  };

  players = propagateBotKnowledge(players, event);

  const next: GoFishGameState = {
    ...state,
    players,
    deck,
    currentPlayerIndex: nextPlayerIndex,
    lastEvent: event,
    winners: [],
  };

  if (isOver(next)) {
    return { ...next, status: "over", winners: computeWinners(next.players) };
  }

  return next;
}

/** Returns state safe to send to a specific player — hides other players' hands and deck. */
export function publicStateFor(
  state: GoFishGameState,
  forPlayerId: string
): GoFishPublicState {
  const ownPlayer = state.players.find((p) => p.id === forPlayerId);
  return {
    gameId: state.gameId,
    status: state.status,
    currentPlayerIndex: state.currentPlayerIndex,
    lastEvent: state.lastEvent,
    winners: state.winners,
    deckSize: state.deck.length,
    ownHand: ownPlayer?.hand ?? [],
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      books: p.books,
      handSize: p.hand.length,
    })),
  };
}
