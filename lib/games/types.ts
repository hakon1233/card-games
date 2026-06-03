export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  suit: Suit;
  rank: Rank;
  hidden?: boolean;
}

export type GameStatus =
  | "waiting"
  | "in_progress"
  | "player_bust"
  | "dealer_bust"
  | "player_win"
  | "dealer_win"
  | "push";

export interface PlayerHand {
  playerId: string;
  isBot: boolean;
  cards: Card[];
}

export interface GameState {
  gameId: string;
  status: GameStatus;
  playerHand: PlayerHand;
  dealerHand: Card[];
  /** Public view — dealer hole card is hidden until dealer's turn */
  deck: Card[];
  turn: "player" | "dealer" | "over";
  result?: "player_win" | "dealer_win" | "push";
}

export type GameActionType = "HIT" | "STAND" | "START";

export interface GameAction {
  type: GameActionType;
  playerId: string;
}

// Partykit message protocol
export type ClientMessage =
  | { type: "JOIN"; playerId: string }
  | { type: "ACTION"; payload: GameAction };

export type ServerMessage =
  | { type: "STATE_UPDATE"; state: PublicGameState }
  | { type: "PLAYER_JOINED"; playerId: string }
  | { type: "GAME_OVER"; result: GameStatus };

/** State safe to broadcast to all clients — dealer hole card hidden during play */
export type PublicGameState = Omit<GameState, "deck">;
