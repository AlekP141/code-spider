import { describe, expect, it } from "vitest";
import type { Link } from "../../src/path/links.js";
import type { SearchResult } from "../../src/path/search.js";
import { search, type Call } from "./graph-source.js";
import {
  mulberry32,
  MODULE_ID,
  randomGraph,
  shuffled,
  type RandomGraph,
} from "./random-graphs.js";

const SEEDS = Array.from({ length: 250 }, (_, i) => i + 1);

function outcome(result: SearchResult) {
  if (result.status !== "found") return { status: result.status };
  const links = result.arranged.steps.map(({ link }) => linkKey(link));
  return {
    status: "found",
    ids: result.arranged.boxes.map((box) => box.id).sort(),
    links: [...new Set(links)].sort(),
  };
}

const linkKey = (l: Link) => `${l.supplier}->${l.consumer}#${l.kind}`;

function run(graph: RandomGraph, swap: boolean) {
  const [a, b] = swap ? [graph.b, graph.a] : [graph.a, graph.b];
  return search(graph.calls, { a, b }).result;
}

function expectSwapInvariant(acyclic: boolean) {
  let found = 0;
  for (const seed of SEEDS) {
    const graph = randomGraph(seed, acyclic);
    const forward = outcome(run(graph, false));
    expect(outcome(run(graph, true)), `seed ${seed}`).toEqual(forward);
    if (forward.status === "found") found += 1;
  }
  expect(found).toBeGreaterThan(20);
}

function expectOnWalks(acyclic: boolean) {
  for (const seed of SEEDS) {
    const graph = randomGraph(seed, acyclic);
    const result = run(graph, false);
    if (result.status !== "found") continue;
    const { steps, boxes } = result.arranged;
    const down = closure(graph.a, steps, "from", "to");
    const up = closure(graph.b, steps, "to", "from");
    for (const { id } of boxes) {
      expect(down.has(id) && up.has(id), `seed ${seed} ${id}`).toBe(true);
    }
  }
}

function closure(
  start: string,
  steps: readonly { from: string; to: string }[],
  near: "from" | "to",
  far: "from" | "to",
): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  for (let at = 0; at < queue.length; at += 1) {
    for (const step of steps) {
      if (step[near] !== queue[at] || seen.has(step[far])) continue;
      seen.add(step[far]);
      queue.push(step[far]);
    }
  }
  return seen;
}

describe("search properties", () => {
  it("swapping A and B gives the same functions and links on seeded random acyclic graphs", () => {
    expectSwapInvariant(true);
  });

  it("swapping A and B gives the same functions and links on seeded random cyclic graphs", () => {
    expectSwapInvariant(false);
  });

  it("every result function lies on a walk from A to B over the route steps, on both families", () => {
    expectOnWalks(true);
    expectOnWalks(false);
  });

  it("a module found as a caller may be a turning point but its id is never passed to callersOf", () => {
    const calls: Call[] = [
      [MODULE_ID, "A"],
      [MODULE_ID, "B"],
    ];
    const { result, asked } = search(calls);
    expect(asked).not.toContain(MODULE_ID);
    expect(outcome(result).ids).toEqual(["A", "B", MODULE_ID]);

    for (const seed of SEEDS) {
      const graph = randomGraph(seed, false);
      const { asked: seen } = search(graph.calls, { a: graph.a, b: graph.b });
      expect(seen).not.toContain(MODULE_ID);
    }
  });

  it("does not depend on the order in which a source returns the links of one climb", () => {
    for (const seed of SEEDS) {
      const graph = randomGraph(seed, false);
      const request = { a: graph.a, b: graph.b };
      const plain = outcome(search(graph.calls, request).result);
      const next = mulberry32(seed);
      const mixed = search(graph.calls, request, {
        order: (links) => shuffled(next, links),
      }).result;
      expect(outcome(mixed), `seed ${seed}`).toEqual(plain);
    }
  });
});
