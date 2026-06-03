import type { PublicGameState } from "./types";
import type { GameShellState, Seat, ShellCard } from "./shell-types";

export interface BlackjackSession {
  wins: number;
  losses: number;
  pushes: number;
}

export function blackjackToShell(
  state: PublicGameState | null,
  playerName: string,
  session: BlackjackSession
): GameShellState {
  if (!state) {
    return { seats: [], status: "waiting" };
  }

  const isOver = state.turn === "over";

  const dealerSeat: Seat = {
    id: "dealer",
    name: "Dealer",
    isBot: true,
    isSelf: false,
    isActive: state.turn === "dealer",
    hand: state.dealerHand.map((c): ShellCard => ({
      suit: c.suit,
      rank: c.rank,
      faceUp: !c.hidden,
    })),
    score: { label: "Wins", value: 0 },
  };

  const resultLabel = state.result === "player_win"
    ? "You win!"
    : state.result === "dealer_win"
    ? "Dealer wins"
    : state.result === "push"
    ? "Push"
    : undefined;

  const playerSeat: Seat = {
    id: state.playerHand.playerId,
    name: playerName,
    isBot: false,
    isSelf: true,
    isActive: state.turn === "player",
    hand: state.playerHand.cards.map((c): ShellCard => ({
      suit: c.suit,
      rank: c.rank,
      faceUp: true,
    })),
    score: { label: "Wins", value: session.wins },
  };

  return {
    seats: [dealerSeat, playerSeat],
    status: isOver ? "over" : "in_progress",
    result: resultLabel,
  };
}
