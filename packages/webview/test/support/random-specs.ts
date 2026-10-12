import type { GraphSlice } from "@code-spider/core/types";
import { id } from "./graph-states.js";
import { randomInt } from "./random.js";
import { makeEdge, makeNode, makeSlice, site } from "./slices.js";

export const POOL = Array.from({ length: 14 }, (_, index) => `n${index}`);

/** A function and the names it calls and is used by. */
export type Spec = { key: string; called: string[]; consumers: string[] };
export type Lines = Record<string, number>;

/** With `next`, each call gets its own random call site. */
export function sliceFromSpec(
  spec: Spec,
  lines: Lines,
  next?: () => number,
): GraphSlice {
  const names = [spec.key, ...spec.called, ...spec.consumers];
  const nodes = names.map((name) =>
    makeNode({ id: id(name), lineCount: lines[id(name)] ?? 3 }),
  );
  const calls = spec.called.map((name) =>
    makeEdge(
      id(name),
      id(spec.key),
      next
        ? { callSite: site(randomInt(next, 2, 6), randomInt(next, 1, 40)) }
        : {},
    ),
  );
  const uses = spec.consumers.map((name) => makeEdge(id(spec.key), id(name)));
  return makeSlice(id(spec.key), nodes, [...calls, ...uses]);
}

export function someNames(
  next: () => number,
  key: string,
  most: number,
): string[] {
  const others = POOL.filter((name) => name !== key);
  const chosen: string[] = [];
  for (let count = randomInt(next, 0, most); count > 0; count -= 1) {
    const name = others[randomInt(next, 0, others.length - 1)];
    if (name !== undefined && !chosen.includes(name)) chosen.push(name);
  }
  return chosen;
}

/** At least `fewest` of its up to `most` neighbours are called functions. */
export function freshSpec(
  next: () => number,
  key: string,
  most: number,
  fewest = 0,
): Spec {
  const names = someNames(next, key, most);
  const cut = randomInt(next, fewest, Math.max(fewest, names.length));
  return { key, called: names.slice(0, cut), consumers: names.slice(cut) };
}

/** Drops some neighbours and brings in others, as editing the code might. */
export function edited(next: () => number, spec: Spec): Spec {
  const kept = () => next() > 0.2;
  const added = someNames(next, spec.key, 2);
  const called = [
    ...new Set([...spec.called.filter(kept), ...added.slice(0, 1)]),
  ];
  const consumers = [
    ...new Set([...spec.consumers.filter(kept), ...added.slice(1)]),
  ].filter((name) => !called.includes(name));
  return { key: spec.key, called, consumers };
}
