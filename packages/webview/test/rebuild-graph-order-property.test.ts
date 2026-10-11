import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { rowGap } from "../src/column-gap.js";
import { calledInOrder } from "../src/graph/call-order.js";
import { compareIds } from "../src/graph/compare-ids.js";
import { NODE_WIDTH } from "../src/graph/constants.js";
import { nodeHeight } from "../src/graph/node-size.js";
import { isClear, TOLERANCE, type Rect } from "../src/graph/placement.js";
import { graphFromSlice, mergeExpansion } from "../src/view/graph-state.js";
import { rebuildGraph } from "../src/view/refresh.js";
import type { GraphState, Point } from "../src/view/types.js";
import { answerOf, id, PROJECT } from "./support/graph-states.js";
import { mulberry32, randomInt } from "./support/random.js";
import { makeEdge, makeNode, makeSlice, site } from "./support/slices.js";

const SEEDS = 2000;
const POOL = Array.from({ length: 14 }, (_, index) => `n${index}`);

type Spec = { key: string; called: string[]; consumers: string[] };
type Lines = Record<string, number>;

function sliceFromSpec(spec: Spec, lines: Lines, next: () => number) {
  const names = [spec.key, ...spec.called, ...spec.consumers];
  const nodes = names.map((name) =>
    makeNode({ id: id(name), lineCount: lines[id(name)] ?? 3 }),
  );
  const calls = spec.called.map((name) =>
    makeEdge(id(name), id(spec.key), {
      callSite: site(randomInt(next, 2, 6), randomInt(next, 1, 40)),
    }),
  );
  const uses = spec.consumers.map((name) => makeEdge(id(spec.key), id(name)));
  return makeSlice(id(spec.key), nodes, [...calls, ...uses]);
}

function someNames(next: () => number, key: string, most: number): string[] {
  const others = POOL.filter((name) => name !== key);
  const chosen: string[] = [];
  for (let count = randomInt(next, 0, most); count > 0; count -= 1) {
    const name = others[randomInt(next, 0, others.length - 1)];
    if (name !== undefined && !chosen.includes(name)) chosen.push(name);
  }
  return chosen;
}

function freshSpec(next: () => number, key: string): Spec {
  const names = someNames(next, key, 6);
  const cut = randomInt(next, 1, Math.max(1, names.length));
  return { key, called: names.slice(0, cut), consumers: names.slice(cut) };
}

function edited(next: () => number, spec: Spec): Spec {
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

function laidOut(next: () => number, gap: number) {
  const lines: Lines = Object.fromEntries(
    POOL.map((name) => [
      id(name),
      next() < 0.5 ? randomInt(next, 1, 3) : randomInt(next, 15, 30),
    ]),
  );
  const specs: Spec[] = [freshSpec(next, "n0")];
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
    const spec = freshSpec(next, key);
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
    const column = (positions[id(spec.key)]?.x ?? 0) - pitch;
    for (const name of spec.called) {
      const nodeId = id(name);
      positions[nodeId] = {
        x: next() < 1 / 6 ? column + randomInt(next, 1, 3) * 70 : column,
        y: randomInt(next, -100, 800),
      };
      if (next() < 0.4) pinned.add(nodeId);
    }
  }
  const current: GraphState = {
    ...graph,
    positions,
    pinned: [...pinned],
    columnGap: gap,
  };
  return { current, specs, lines };
}

function rectOf(graph: GraphState, nodeId: NodeId): Rect {
  const at = graph.positions[nodeId] ?? { x: NaN, y: NaN };
  const node = graph.nodes[nodeId];
  return { ...at, width: NODE_WIDTH, height: node ? nodeHeight(node) : NaN };
}

type Group = { key: NodeId; members: NodeId[]; called: NodeId[] };

/** D5: the unpinned, kept, in-column called boxes no earlier function took. */
function groupsOf(
  slices: GraphSlice[],
  current: GraphState,
  graph: GraphState,
  gap: number,
): Group[] {
  const pinned = new Set(graph.pinned);
  const taken = new Set<NodeId>();
  return slices.map((slice) => {
    const key = slice.focusId;
    const column = (graph.positions[key]?.x ?? NaN) - (NODE_WIDTH + gap);
    const called = calledInOrder(key, slice.edges);
    const members = called.filter((nodeId) => {
      const x = graph.positions[nodeId]?.x ?? NaN;
      return (
        Object.hasOwn(current.positions, nodeId) &&
        !pinned.has(nodeId) &&
        !taken.has(nodeId) &&
        Math.abs(x - column) <= TOLERANCE
      );
    });
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

      const pitch = NODE_WIDTH + gap;
      for (const group of groupsOf(applied, current, graph, gap)) {
        const tops = group.members.map((nodeId) => graph.positions[nodeId]?.y);
        for (let at = 1; at < tops.length; at += 1) {
          expect(
            tops[at] as number,
            `${label} ${group.key} ${group.members[at]} order`,
          ).toBeGreaterThan(tops[at - 1] as number);
        }
        if (wasRestacked(group, current, fresh)) restacked += 1;
        const column = (graph.positions[group.key]?.x ?? NaN) - pitch;
        if (group.members.length > 0) {
          beside += group.called.filter(
            (nodeId) =>
              pinned.has(nodeId) &&
              Math.abs((graph.positions[nodeId]?.x ?? NaN) - column) <=
                TOLERANCE,
          ).length;
        }
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
