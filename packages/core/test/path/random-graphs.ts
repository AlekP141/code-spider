import type { Call } from "./graph-source.js";

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(
  next: () => number,
  min: number,
  max: number,
): number {
  return min + Math.floor(next() * (max - min + 1));
}

export function shuffled<T>(next: () => number, items: readonly T[]): T[] {
  const copy = [...items];
  for (let at = copy.length - 1; at > 0; at -= 1) {
    const to = randomInt(next, 0, at);
    [copy[at], copy[to]] = [copy[to] as T, copy[at] as T];
  }
  return copy;
}

export const MODULE_ID = "m.ts#<module>";

export type RandomGraph = { calls: Call[]; a: string; b: string };

/**
 * Functions f0..f(n-1) plus one module that only calls. Acyclic graphs let
 * higher numbers call lower ones; cyclic graphs allow any pair.
 */
export function randomGraph(seed: number, acyclic: boolean): RandomGraph {
  const next = mulberry32(seed);
  const size = randomInt(next, 4, 10);
  const calls: Call[] = [];
  for (let caller = 0; caller < size; caller += 1) {
    for (let callee = 0; callee < size; callee += 1) {
      if (caller === callee || (acyclic && caller < callee)) continue;
      if (next() < 0.22) calls.push([`f${caller}`, `f${callee}`]);
    }
  }
  for (let callee = 0; callee < size; callee += 1) {
    if (next() < 0.2) calls.push([MODULE_ID, `f${callee}`]);
  }
  const a = randomInt(next, 0, size - 1);
  const offset = randomInt(next, 1, size - 1);
  return { calls, a: `f${a}`, b: `f${(a + offset) % size}` };
}
