import { describe, expect, it } from "vitest";
import { rowGap } from "../../src/settings/column-gap.js";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { isClear } from "../../src/graph/layout/placement.js";
import { graphFromSlice, mergeExpansion } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { Point } from "../../src/view/types.js";
import { rectOf } from "../support/geometry.js";
import { answerOf, id, PROJECT } from "../support/graph-states.js";
import { mulberry32, randomInt, shuffled } from "../support/random.js";
import {
  edited,
  freshSpec,
  POOL,
  sliceFromSpec,
  type Lines,
  type Spec,
} from "../support/random-specs.js";

function linesFor(next: () => number): Lines {
  return Object.fromEntries(
    POOL.map((name) => [id(name), randomInt(next, 1, 30)]),
  );
}

function build(next: () => number, gap: number) {
  const lines = linesFor(next);
  const specs: Spec[] = [freshSpec(next, "n0", 5)];
  let graph = graphFromSlice(sliceFromSpec(specs[0] as Spec, lines), PROJECT);
  for (let count = randomInt(next, 0, 3); count > 0; count -= 1) {
    const open = Object.keys(graph.nodes).filter(
      (nodeId) => nodeId !== graph.focusId && !(nodeId in graph.slices),
    );
    const key = open[randomInt(next, 0, open.length - 1)]?.split("#")[1];
    if (key === undefined) break;
    const spec = freshSpec(next, key, 5);
    specs.push(spec);
    graph = mergeExpansion(graph, id(key), sliceFromSpec(spec, lines)).graph;
  }
  const pitch = NODE_WIDTH + gap;
  const positions: Record<string, Point> = {};
  for (const nodeId of Object.keys(graph.nodes)) {
    const jitter = next() < 0.3 ? randomInt(next, -90, 90) : 0;
    positions[nodeId] = {
      x: randomInt(next, -2, 2) * pitch + jitter,
      y: randomInt(next, -400, 1200),
    };
  }
  const pinned = Object.keys(graph.nodes).filter(() => next() < 0.3);
  return { current: { ...graph, positions, pinned, columnGap: gap }, specs };
}

describe("rebuildGraph on random graphs", () => {
  it("leaves room for the grown, places the new clear of everything, and moves kept boxes only down", () => {
    let added = 0;
    let moved = 0;
    let slid = 0;
    let shared = 0;
    let vanished = 0;
    let unpinned = 0;
    for (let seed = 1; seed <= 240; seed += 1) {
      const next = mulberry32(seed);
      const gap = [32, 192, 480][seed % 3] ?? 192;
      const margin = rowGap(gap);
      const { current, specs } = build(next, gap);
      const label = `seed ${seed} gap ${gap}`;
      const lines = linesFor(next);
      const [centre, ...rest] = specs.map((spec) => edited(next, spec));
      const expansions = rest.map((spec) => ({
        nodeId: id(spec.key),
        slice: sliceFromSpec(spec, lines),
      }));
      const centreSlice = sliceFromSpec(centre as Spec, lines);
      const answer = answerOf(
        current,
        centreSlice,
        shuffled(next, expansions),
      );
      const result = rebuildGraph(current, answer, gap);
      const reshuffled = answerOf(
        current,
        centreSlice,
        shuffled(next, expansions),
      );
      expect(rebuildGraph(current, reshuffled, gap), `${label} order`).toEqual(
        result,
      );
      const { graph } = result;
      const pinned = new Set(graph.pinned);
      const suppliers = new Set(
        Object.values(graph.edges).map((edge) => edge.from),
      );

      const kept = Object.keys(graph.nodes).filter((nodeId) =>
        Object.hasOwn(current.positions, nodeId),
      );
      const fresh = Object.keys(graph.nodes).filter(
        (nodeId) => !Object.hasOwn(current.positions, nodeId),
      );
      expect([...result.added].sort(), label).toEqual(fresh.sort());
      for (const nodeId of kept) {
        const before = current.positions[nodeId] as Point;
        const after = graph.positions[nodeId] as Point;
        expect(after.x, `${label} ${nodeId} sideways`).toBe(before.x);
        if (pinned.has(nodeId)) {
          expect(after.y, `${label} ${nodeId} pinned`).toBe(before.y);
        } else {
          if (!suppliers.has(nodeId)) {
            expect(after.y, `${label} ${nodeId} up`).toBeGreaterThanOrEqual(
              before.y,
            );
          }
          if (after.y > before.y) slid += 1;
        }
      }

      const ids = Object.keys(graph.nodes);
      expect(Object.keys(graph.positions).sort(), label).toEqual(ids.sort());
      for (const [index, first] of ids.entries()) {
        for (const second of ids.slice(index + 1)) {
          if (pinned.has(first) && pinned.has(second)) continue;
          expect(
            isClear(rectOf(graph, first), rectOf(graph, second), margin),
            `${label} ${first} ${second}`,
          ).toBe(true);
        }
      }
      added += result.added.length;
      moved += kept.length;
      const listing = (nodeId: string) =>
        [centreSlice, ...expansions.map((entry) => entry.slice)].filter(
          (slice) =>
            Object.hasOwn(graph.slices, slice.focusId) &&
            slice.nodes.some((node) => node.id === nodeId),
        ).length;
      shared += result.added.filter((nodeId) => listing(nodeId) > 1).length;
      vanished +=
        Object.keys(current.slices).length - Object.keys(graph.slices).length;
      unpinned += current.pinned.length - graph.pinned.length;
    }
    expect(added).toBeGreaterThan(100);
    expect(moved).toBeGreaterThan(100);
    expect(slid).toBeGreaterThan(50);
    expect(shared).toBeGreaterThan(5);
    expect(vanished).toBeGreaterThan(20);
    expect(unpinned).toBeGreaterThan(20);
  });
});
