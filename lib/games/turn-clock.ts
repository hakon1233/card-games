import type { YanivGameState } from "./yaniv";

export function getTurnClockKey(state: YanivGameState | null, playerId: string): string | null {
  const activePlayer = state?.players[state.currentPlayerIndex];
  if (
    !state ||
    state.status !== "in_progress" ||
    state.quickDrawWindow ||
    activePlayer?.id !== playerId
  ) {
    return null;
  }

  const handKey = activePlayer.hand.map((card) => `${card.suit}-${card.rank}`).join(",");
  return [
    state.round,
    state.currentPlayerIndex,
    activePlayer.id,
    handKey,
    state.deck.length,
    state.discardPile.length,
  ].join(":");
}
