import type { NodeId } from "@code-spider/core/types";
import type { Point } from "../view/types.js";
import { compareIds } from "./compare-ids.js";
import { TOLERANCE } from "./placement.js";

function columnsByX(positions: Record<NodeId, Point>): NodeId[][] {
  const x = (nodeId: NodeId) => positions[nodeId]?.x ?? 0;
  const columns: NodeId[][] = [];
  const ids = Object.keys(positions).sort((a, b) => x(a) - x(b));
  for (const nodeId of ids) {
    const column = columns.at(-1);
    const last = column?.at(-1);
    if (column && last !== undefined && x(nodeId) - x(last) <= TOLERANCE) {
      column.push(nodeId);
    } else {
      columns.push([nodeId]);
    }
  }
  return columns;
}

/**
 * Hands each column's slots (its tops, ascending) to its boxes in `order`,
 * then moves boxes down where a taller one now above them needs the room.
 * x never changes. An id missing from `order` goes after the listed ones.
 */
export function orderColumns(
  positions: Record<NodeId, Point>,
  heights: Readonly<Record<NodeId, number>>,
  order: readonly NodeId[],
  margin: number,
): Record<NodeId, Point> {
  const rank = new Map(order.map((nodeId, index) => [nodeId, index]));
  const rankOf = (nodeId: NodeId) => rank.get(nodeId) ?? order.length;
  const result: Record<NodeId, Point> = {};
  for (const column of columnsByX(positions)) {
    const slots = column
      .map((nodeId) => positions[nodeId]?.y ?? 0)
      .sort((a, b) => a - b);
    const inOrder = [...column].sort(
      (a, b) => rankOf(a) - rankOf(b) || compareIds(a, b),
    );
    let floor = Number.NEGATIVE_INFINITY;
    inOrder.forEach((nodeId, index) => {
      const y = Math.max(slots[index] ?? 0, floor);
      result[nodeId] = { x: positions[nodeId]?.x ?? 0, y };
      floor = y + (heights[nodeId] ?? 0) + margin;
    });
  }
  return result;
}
