import type { NodeId } from "@code-spider/core/types";
import { rowGap } from "../column-gap.js";
import type { Point } from "../view/types.js";
import { calledInOrder, type CallEdge } from "./call-order.js";
import { compareIds } from "./compare-ids.js";
import { NODE_WIDTH } from "./constants.js";

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Absorbs floating point error in positions that were computed, not typed. */
export const TOLERANCE = 1e-6;

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

/** The smallest y from `rect.y` down where `rect` is clear of the obstacles. */
export function lowestClearY(
  rect: Rect,
  obstacles: readonly Rect[],
  margin: number,
): number {
  const candidates = [
    rect.y,
    ...obstacles.map((obstacle) => obstacle.y + obstacle.height + margin),
  ]
    .filter((y) => y >= rect.y)
    .sort((a, b) => a - b);
  return (
    candidates.find((y) =>
      obstacles.every((obstacle) => isClear({ ...rect, y }, obstacle, margin)),
    ) ?? rect.y
  );
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
  edges: readonly CallEdge[];
  /** Every node already in the graph, the anchor included. */
  existing: readonly Rect[];
  columnGap: number;
};

const byId = (a: AddedNode, b: AddedNode) => compareIds(a.id, b.id);

/**
 * Called functions of the expanded node go one column to its left in code
 * order, everything else one column to its right in id order. Each column is a
 * stack centred on the anchor. The first box takes the nearest free y; every
 * later box takes the lowest free y at or below its preferred top and the box
 * before it, so a column keeps its order and nothing already in the graph,
 * dragged or not, is ever covered.
 */
export function placeExpansion(input: Placement): Record<NodeId, Point> {
  const pitch = NODE_WIDTH + input.columnGap;
  const margin = rowGap(input.columnGap);
  const addedById = new Map(input.added.map((node) => [node.id, node]));
  const called = calledInOrder(input.expandedId, input.edges).flatMap((id) => {
    const node = addedById.get(id);
    return node ? [node] : [];
  });
  const calledIds = new Set(called.map((node) => node.id));
  const columns = [
    { x: input.anchor.x - pitch, nodes: called },
    {
      x: input.anchor.x + pitch,
      nodes: input.added.filter((node) => !calledIds.has(node.id)).sort(byId),
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
    let previousBottom = Number.NEGATIVE_INFINITY;
    for (const [index, node] of nodes.entries()) {
      const column = { x, width: NODE_WIDTH, height: node.height };
      const preferred = tops[index] ?? centreY;
      const y =
        index === 0
          ? nearestFreeY(preferred, column, obstacles, margin)
          : lowestClearY(
              { ...column, y: Math.max(preferred, previousBottom + margin) },
              obstacles,
              margin,
            );
      placed[node.id] = { x, y };
      obstacles.push({ ...column, y });
      previousBottom = y + node.height;
    }
  }
  return placed;
}
