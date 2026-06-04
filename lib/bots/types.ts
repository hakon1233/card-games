export interface BotPlayer<S, A> {
  getNextMove(state: S, playerId: string): A;
}
