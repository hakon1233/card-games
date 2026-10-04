/** A source of randomness in [0, 1), like Math.random. Tests pass a seeded one. */
export type Rng = () => number;

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
