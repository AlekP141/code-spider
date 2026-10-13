import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { rowGap } from "../../src/settings/column-gap.js";
import {
  calledInOrder,
  walkParents,
} from "../../src/graph/layout/call-order.js";
import { compareIds } from "../../src/graph/layout/compare-ids.js";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { isClear, TOLERANCE } from "../../src/graph/layout/placement.js";
import { graphFromSlice, mergeExpansion } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { GraphState, Point } from "../../src/view/types.js";
import { rectOf } from "../support/geometry.js";
import { answerOf, id, openAll, PROJECT } from "../support/graph-states.js";
import { mulberry32, randomInt } from "../support/random.js";
import {
  edited,
  freshSpec,
  POOL,
  sliceFromSpec,
  type Lines,
  type Spec,
} from "../support/random-specs.js";

const SEEDS = 2000;

function laidOut(next: () => number, gap: number) {
  const lines: Lines = Object.fromEntries(
    POOL.map((name) => [
      id(name),
      next() < 0.5 ? randomInt(next, 1, 3) : randomInt(next, 15, 30),
    ]),
  );
  const specs: Spec[] = [freshSpec(next, "n0", 6, 1)];
  let graph = graphFromSlice(
    sliceFromSpec(specs[0] as Spec, lines, next),
    PROJECT,
  );
  for (let count = randomInt(next, 0, 3); count > 0; count -= 1) {
    const open = Object.keys(graph.nodes).filter(
      (nodeId) => nodeId !== graph.focusId && !(nodeId in graph.slices),
    );
    const key = open[randomInt(next, 0, open.length - 1)]?.split("#")[1];
    if (key === undefined) break;
    const spec = freshSpec(next, key, 6, 1);
    specs.push(spec);
    const slice = sliceFromSpec(spec, lines, next);
    graph = mergeExpansion(graph, id(key), slice).graph;
  }
  const pitch = NODE_WIDTH + gap;
  const positions: Record<NodeId, Point> = {};
  for (const nodeId of Object.keys(graph.nodes)) {
    positions[nodeId] = {
      x: randomInt(next, 1, 5) * pitch,
      y: randomInt(next, -400, 1200),
    };
  }
  const pinned = new Set<NodeId>();
  for (const spec of specs) {
    const nudge = next() < 0.25 ? randomInt(next, -20, 70) : 0;
    const column = (positions[id(spec.key)]?.x ?? 0) - pitch + nudge;
    for (const name of spec.called) {
      const nodeId = id(name);
      positions[nodeId] = {
        x: next() < 1 / 6 ? column + randomInt(next, 1, 3) * 70 : column,
        y: randomInt(next, -100, 800),
      };
      if (next() < 0.4) pinned.add(nodeId);
    }
  }
  const current: GraphState = openAll({
    ...graph,
    positions,
    pinned: [...pinned],
    columnGap: gap,
  });
  return { current, specs, lines };
}

type Group = { key: NodeId; members: NodeId[]; called: NodeId[] };

/** The x most boxes share; on a tie the one nearest `expected`. */
function commonX(xs: number[], expected: number): number | undefined {
  const score = (x: number) =>
    xs.filter((other) => Math.abs(other - x) <= TOLERANCE).length;
  return [...xs].sort(
    (a, b) =>
      score(b) - score(a) || Math.abs(a - expected) - Math.abs(b - expected),
  )[0];
}

/**
 * D5: the unpinned, kept called boxes the walk first reached through the
 * function, standing left of it in the column most of them share, that no
 * earlier function took.
 */
function groupsOf(
  slices: GraphSlice[],
  current: GraphState,
  graph: GraphState,
  gap: number,
): Group[] {
  const pinned = new Set(graph.pinned);
  const owners = walkParents(graph);
  const taken = new Set<NodeId>();
  const xOf = (nodeId: NodeId) => graph.positions[nodeId]?.x ?? Number.NaN;
  return slices.map((slice) => {
    const key = slice.focusId;
    const called = calledInOrder(key, slice.edges);
    const candidates = called.filter(
      (nodeId) =>
        Object.hasOwn(current.positions, nodeId) &&
        !pinned.has(nodeId) &&
        !taken.has(nodeId) &&
        owners.get(nodeId) === key &&
        xOf(nodeId) + NODE_WIDTH <= xOf(key) + TOLERANCE,
    );
    const column = commonX(candidates.map(xOf), xOf(key) - NODE_WIDTH - gap);
    const members = candidates.filter(
      (nodeId) => Math.abs(xOf(nodeId) - (column ?? Number.NaN)) <= TOLERANCE,
    );
    for (const nodeId of members) taken.add(nodeId);
    return { key, members, called };
  });
}

function wasRestacked(group: Group, current: GraphState, fresh: Set<NodeId>) {
  const top = (nodeId: NodeId) => current.positions[nodeId]?.y ?? 0;
  const standing = [...group.members].sort(
    (a, b) => top(a) - top(b) || compareIds(a, b),
  );
  const misordered = standing.some(
    (nodeId, at) => nodeId !== group.members[at],
  );
  const brings = group.called.some((nodeId) => fresh.has(nodeId));
  return group.members.length > 0 && (misordered || brings);
}

describe("rebuildGraph keeps called boxes in code order on random graphs", () => {
  it("leaves every unpinned group in code order, clear, and pinned or kept boxes where they were", () => {
    let restacked = 0;
    let beside = 0;
    let placed = 0;
    let pushed = 0;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const next = mulberry32(seed);
      const gap = [32, 192, 480][seed % 3] ?? 192;
      const margin = rowGap(gap);
      const { current, specs, lines } = laidOut(next, gap);
      const label = `seed ${seed} gap ${gap}`;
      const [centreSpec, ...rest] = specs.map((spec) => edited(next, spec));
      const centre = sliceFromSpec(centreSpec as Spec, lines, next);
      const expansions = rest.map((spec) => ({
        nodeId: id(spec.key),
        slice: sliceFromSpec(spec, lines, next),
      }));
      const answer = answerOf(current, centre, expansions);
      const result = rebuildGraph(current, answer, gap);
      const { graph } = result;
      const pinned = new Set(graph.pinned);

      const byKey = new Map([
        [centre.focusId, centre],
        ...expansions.map((entry) => [entry.nodeId, entry.slice] as const),
      ]);
      const applied = Object.keys(graph.slices).flatMap((key) => {
        const slice = byKey.get(key);
        return slice ? [slice] : [];
      });
      expect(applied.length, label).toBe(Object.keys(graph.slices).length);
      const fresh = new Set(
        Object.keys(graph.nodes).filter(
          (nodeId) => !Object.hasOwn(current.positions, nodeId),
        ),
      );
      expect([...result.added].sort(), label).toEqual([...fresh].sort());

      for (const nodeId of Object.keys(graph.nodes)) {
        if (fresh.has(nodeId)) continue;
        const before = current.positions[nodeId] as Point;
        const after = graph.positions[nodeId] as Point;
        expect(after.x, `${label} ${nodeId} sideways`).toBe(before.x);
        if (pinned.has(nodeId)) {
          expect(after.y, `${label} ${nodeId} pinned`).toBe(before.y);
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

      for (const group of groupsOf(applied, current, graph, gap)) {
        const tops = group.members.map((nodeId) => graph.positions[nodeId]?.y);
        for (let at = 1; at < tops.length; at += 1) {
          expect(
            tops[at] as number,
            `${label} ${group.key} ${group.members[at]} order`,
          ).toBeGreaterThan(tops[at - 1] as number);
        }
        if (wasRestacked(group, current, fresh)) restacked += 1;
        const column = graph.positions[group.members[0] ?? ""]?.x ?? Number.NaN;
        beside += group.called.filter(
          (nodeId) =>
            pinned.has(nodeId) &&
            Math.abs((graph.positions[nodeId]?.x ?? Number.NaN) - column) <=
              TOLERANCE,
        ).length;
        placed += group.called.filter((nodeId) => fresh.has(nodeId)).length;
        for (const nodeId of group.members) {
          const from = current.positions[nodeId]?.y ?? NaN;
          const to = graph.positions[nodeId]?.y ?? NaN;
          const x = graph.positions[nodeId]?.x ?? NaN;
          pushed += [...pinned].filter((other) => {
            const box = rectOf(graph, other);
            const bottom = box.y + box.height;
            return (
              Math.abs(box.x - x) < NODE_WIDTH &&
              from < bottom &&
              to >= bottom &&
              to > from
            );
          }).length;
        }
      }
    }
    expect(restacked).toBeGreaterThan(300);
    expect(beside).toBeGreaterThan(300);
    expect(placed).toBeGreaterThan(700);
    expect(pushed).toBeGreaterThan(400);
  });
});
