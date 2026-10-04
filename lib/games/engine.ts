/** The seat id of the human at a single-player table, where everyone else is a bot. */
export const HUMAN_PLAYER_ID = "player-1";

/** A source of randomness in [0, 1), like Math.random. Tests pass a seeded one. */
export type Rng = () => number;

/** An Rng drawn from the platform's cryptographic source, for shuffles nobody may predict. */
export function cryptoRng(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

/**
 * A deterministic Rng (mulberry32): the same seed gives the same stream on every
 * platform, so a seeded deal or a whole simulated game replays exactly.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The shape every game's rules engine shares. Each game module exports these
 * three plus its own `deal(..., rng?)`, whose options differ per game.
 */
export interface RulesEngine<State, Action, View> {
  /** The next state; an illegal or out-of-turn action returns the same state object. */
  apply(state: State, action: Action, rng?: Rng): State;
  /** What one player may see: never another player's cards or the draw pile's cards. */
  playerView(state: State, playerId: string): View;
  /** Who must act next; null when nobody can (the round or game is over). */
  activePlayer(state: State): string | null;
}
