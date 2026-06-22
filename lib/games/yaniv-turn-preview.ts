export interface TurnPreviewPlayer {
  id: string;
  name: string;
  eliminated: boolean;
}

export function getTurnPreviewName(
  players: TurnPreviewPlayer[],
  currentPlayerIndex: number,
  previousPlayerId: string | null,
): string | null {
  const currentPlayer = players[currentPlayerIndex];
  if (!currentPlayer || currentPlayer.eliminated) return null;
  if (previousPlayerId === null || previousPlayerId === currentPlayer.id) return null;
  return currentPlayer.name;
}
