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
  | "K"
  | "Joker";

export interface Card {
  suit: Suit;
  rank: Rank;
  hidden?: boolean;
}

export type StoredGameType = "blackjack" | "go_fish" | "crazy_eights";

export interface BaseGameState {
  gameId: string;
  status: string;
  gameType?: StoredGameType;
}
