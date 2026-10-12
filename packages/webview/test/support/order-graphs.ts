import type { GraphEdge, GraphNode, GraphSlice } from "@code-spider/core/types";
import { rowGap } from "../../src/settings/column-gap.js";
import { layoutPositions, walkOrderedFlow } from "../../src/graph/layout.js";
import { nodeHeight } from "../../src/graph/node-size.js";
import { TOLERANCE } from "../../src/graph/placement.js";
import { graphFromSlice, mergeExpansion } from "../../src/view/graph-state.js";
import type { GraphState, Point } from "../../src/view/types.js";
import { PROJECT } from "./graph-states.js";
import { mulberry32, randomInt, shuffled } from "./random.js";
import { makeEdge, makeNode, makeSlice, site } from "./slices.js";

const nodeId = (index: number) => `a#n${String(index).padStart(2, "0")}`;

function randomEdges(
  next: () => number,
  pairs: [number, number][],
  firstLine: number,
): GraphEdge[] {
  const lines = shuffled(
    next,
    pairs.map((_, index) => firstLine + index),
  );
  return pairs.map(([from, to], index) =>
    makeEdge(nodeId(from), nodeId(to), {
      callSite: site(lines[index] ?? 2, randomInt(next, 1, 20)),
    }),
  );
}

function randomPairs(
  next: () => number,
  among: number[],
  chance: number,
): [number, number][] {
  const pairs: [number, number][] = [];
  for (const from of among) {
    for (const to of among) {
      if (from !== to && next() < chance) pairs.push([from, to]);
    }
  }
  return pairs;
}

function randomNode(next: () => number, index: number): GraphNode {
  return makeNode({ id: nodeId(index), lineCount: randomInt(next, 1, 30) });
}

function expansionSlice(
  next: () => number,
  key: number,
  known: number,
  fresh: number,
  firstLine: number,
): GraphSlice {
  const others = [
    ...Array.from({ length: fresh }, (_, offset) => known + offset),
    ...Array.from({ length: known }, (_, index) => index).filter(
      (index) => index !== key && next() < 0.2,
    ),
  ];
  const pairs = others.flatMap((other): [number, number][] =>
    next() < 0.75 ? [[other, key]] : [[key, other]],
  );
  return makeSlice(
    nodeId(key),
    [key, ...others].map((index) =>
      index >= known
        ? randomNode(next, index)
        : makeNode({ id: nodeId(index) }),
    ),
    randomEdges(next, pairs, firstLine),
  );
}

/**
 * A centre graph of 2 to 14 functions with random calls (so some are called
 * from several places), one or two expansions merged in, and no positions.
 */
export function randomGraph(seed: number): GraphState {
  const next = mulberry32(seed);
  const count = randomInt(next, 2, 9);
  const all = Array.from({ length: count }, (_, index) => index);
  const pairs = randomPairs(next, all, 2 / count);
  const slice = makeSlice(
    nodeId(0),
    all.map((index) => randomNode(next, index)),
    randomEdges(next, pairs, 2),
  );
  let graph = graphFromSlice(slice, PROJECT);
  let known = count;
  for (let round = randomInt(next, 1, 2); round > 0; round -= 1) {
    if (known >= 14) break;
    const fresh = randomInt(next, 1, Math.min(4, 14 - known));
    const key = randomInt(next, 1, known - 1);
    const expansion = expansionSlice(next, key, known, fresh, 100 * round);
    graph = mergeExpansion(graph, nodeId(key), expansion).graph;
    known += fresh;
  }
  return graph;
}

/** Ids of each column (same x within the tolerance), each top to bottom. */
export function columnsOf(positions: Record<string, Point>): string[][] {
  const sorted = Object.entries(positions).sort(
    ([, a], [, b]) => a.x - b.x || a.y - b.y,
  );
  const columns: [string, Point][][] = [];
  for (const entry of sorted) {
    const column = columns.at(-1);
    const last = column?.at(-1);
    if (column && last && entry[1].x - last[1].x <= TOLERANCE) {
      column.push(entry);
    } else {
      columns.push([entry]);
    }
  }
  return columns.map((column) =>
    column.sort(([, a], [, b]) => a.y - b.y).map(([nodeId]) => nodeId),
  );
}

/** Pairs of neighbours in a column that sit closer than the row gap. */
export function crowded(
  graph: GraphState,
  positions: Record<string, Point>,
  columnGap: number,
): string[] {
  const found: string[] = [];
  for (const column of columnsOf(positions)) {
    column.slice(1).forEach((lower, index) => {
      const upper = column[index] ?? "";
      const node = graph.nodes[upper];
      const bottom = (positions[upper]?.y ?? 0) + (node ? nodeHeight(node) : 0);
      const top = positions[lower]?.y ?? 0;
      if (top < bottom + rowGap(columnGap) - TOLERANCE) {
        found.push(`${upper} above ${lower}`);
      }
    });
  }
  return found;
}

/** The columns whose boxes are not top to bottom in `order`. */
export function outOfOrder(
  positions: Record<string, Point>,
  order: readonly string[],
): number {
  const rank = new Map(order.map((nodeId, index) => [nodeId, index]));
  const at = (nodeId: string) => rank.get(nodeId) ?? Number.NaN;
  return columnsOf(positions).filter((column) =>
    column
      .slice(1)
      .some((nodeId, index) => at(nodeId) < at(column[index] ?? "")),
  ).length;
}

/** ELK's own layout of the graph fed in walk order, with no column re-sort. */
export function elkAlone(
  graph: GraphState,
  columnGap: number,
): Promise<Record<string, Point>> {
  const { nodes, edges } = walkOrderedFlow(graph);
  return layoutPositions(nodes, edges, columnGap);
}
