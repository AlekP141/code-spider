import type { GraphEdge, NodeId } from "@code-spider/core/types";
import { rowGap } from "../column-gap.js";
import type { Point } from "../view/types.js";
import { NODE_WIDTH } from "./constants.js";

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Absorbs floating point error in positions that were computed, not typed. */
const TOLERANCE = 1e-6;

function gap(startA: number, sizeA: number, startB: number, sizeB: number) {
  return Math.max(startA - (startB + sizeB), startB - (startA + sizeA));
}

/** Two nodes are clear when one axis keeps them at least `margin` apart. */
export function isClear(a: Rect, b: Rect, margin: number): boolean {
  return (
    gap(a.x, a.width, b.x, b.width) >= margin - TOLERANCE ||
    gap(a.y, a.height, b.y, b.height) >= margin - TOLERANCE
  );
}

/**
 * The y nearest `preferredY` (a tie goes up) where a rectangle of the column's
 * size is clear of every obstacle. The forbidden y values are open intervals,
 * so the answer is `preferredY` or the end of an interval; a position under
 * every obstacle is always free, which ends the search.
 */
export function nearestFreeY(
  preferredY: number,
  column: { x: number; width: number; height: number },
  obstacles: readonly Rect[],
  margin: number,
): number {
  const isFree = (y: number) => {
    const candidate = { ...column, y };
    return obstacles.every((obstacle) => isClear(candidate, obstacle, margin));
  };
  const ends = obstacles.flatMap((obstacle) => [
    obstacle.y + obstacle.height + margin,
    obstacle.y - margin - column.height,
  ]);
  const nearestFirst = [preferredY, ...ends].sort(
    (a, b) => Math.abs(a - preferredY) - Math.abs(b - preferredY) || a - b,
  );
  const underAll = Math.max(
    preferredY,
    ...obstacles.map((obstacle) => obstacle.y + obstacle.height + margin),
  );
  return nearestFirst.find(isFree) ?? underAll;
}

/** Preferred tops for a stack of nodes `margin` apart, centred on a line. */
export function stackTops(
  centreY: number,
  heights: readonly number[],
  margin: number,
): number[] {
  const total =
    heights.reduce((sum, height) => sum + height, 0) +
    margin * Math.max(0, heights.length - 1);
  let top = centreY - total / 2;
  return heights.map((height) => {
    const current = top;
    top += height + margin;
    return current;
  });
}

export type AddedNode = { id: NodeId; height: number };

export type Placement = {
  expandedId: NodeId;
  anchor: Rect;
  added: readonly AddedNode[];
  edges: readonly Pick<GraphEdge, "from" | "to">[];
  /** Every node already in the graph, the anchor included. */
  existing: readonly Rect[];
  columnGap: number;
};

const byId = (a: AddedNode, b: AddedNode) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Suppliers of the expanded node go one column to its left, everything else one
 * column to its right. Each column is a stack in id order centred on the
 * anchor, and each node then moves to the nearest free y, so nothing already in
 * the graph, dragged or not, is ever covered.
 */
export function placeExpansion(input: Placement): Record<NodeId, Point> {
  const pitch = NODE_WIDTH + input.columnGap;
  const margin = rowGap(input.columnGap);
  const suppliers = new Set(
    input.edges
      .filter((edge) => edge.to === input.expandedId)
      .map((edge) => edge.from),
  );
  const columns = [
    {
      x: input.anchor.x - pitch,
      nodes: input.added.filter((node) => suppliers.has(node.id)).sort(byId),
    },
    {
      x: input.anchor.x + pitch,
      nodes: input.added.filter((node) => !suppliers.has(node.id)).sort(byId),
    },
  ];
  const centreY = input.anchor.y + input.anchor.height / 2;
  const obstacles = [...input.existing];
  const placed: Record<NodeId, Point> = {};
  for (const { x, nodes } of columns) {
    const tops = stackTops(
      centreY,
      nodes.map((node) => node.height),
      margin,
    );
    for (const [index, node] of nodes.entries()) {
      const column = { x, width: NODE_WIDTH, height: node.height };
      const y = nearestFreeY(tops[index] ?? centreY, column, obstacles, margin);
      placed[node.id] = { x, y };
      obstacles.push({ ...column, y });
    }
  }
  return placed;
}
