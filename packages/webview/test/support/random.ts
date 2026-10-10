/** A small seeded generator so property tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max], both included. */
export function randomInt(
  next: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(next() * (max - min + 1));
}
