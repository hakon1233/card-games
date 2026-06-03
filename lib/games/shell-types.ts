import type { Suit, Rank } from "./types";

export interface ShellCard {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
}

export interface SeatScore {
  label: string;
  value: number;
}

export interface Seat {
  id: string;
  name: string;
  isBot: boolean;
  isSelf: boolean;
  isActive: boolean;
  hand: ShellCard[];
  score: SeatScore;
}

export interface GameShellState {
  seats: Seat[];
  status: "waiting" | "in_progress" | "over";
  result?: string;
}
