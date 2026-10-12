import type { NodeId } from "@code-spider/core/types";
import type { Point } from "../view/types.js";
import { compareIds } from "./compare-ids.js";
import { columnsByX } from "./order-columns.js";
import {
  lowestClearY,
  nearestFreeY,
  type Rect,
  type Size,
} from "./placement.js";

export type TidyInput = {
  /** ELK's layout of every node. */
  elk: Readonly<Record<NodeId, Point>>;
  sizes: Readonly<Record<NodeId, Size>>;
  /** The current position of each pinned node. */
  pinned: Readonly<Record<NodeId, Point>>;
  /** The space to keep between boxes, from the row gap. */
  margin: number;
};

/**
 * Pinned nodes stay where they are. The unpinned nodes of each column keep
 * their top-to-bottom order: the first goes to the nearest free y to ELK's,
 * every later one to the lowest free y at or below ELK's and the previous
 * node's bottom plus the margin. A node that is clear of the pinned ones and
 * of the node above it keeps ELK's place, and x never changes.
 */
export function tidyPositions(input: TidyInput): Record<NodeId, Point> {
  const result: Record<NodeId, Point> = {};
  const pinned: Rect[] = [];
  const unpinned: Record<NodeId, Rect> = {};
  for (const [id, size] of Object.entries(input.sizes)) {
    const fixed = input.pinned[id];
    const laidOut = input.elk[id];
    if (fixed) {
      result[id] = fixed;
      pinned.push({ ...fixed, ...size });
    } else if (laidOut) {
      unpinned[id] = { ...laidOut, ...size };
    }
  }

  for (const column of columnsByX(unpinned)) {
    const rects = column.flatMap((id): [NodeId, Rect][] => {
      const rect = unpinned[id];
      return rect ? [[id, rect]] : [];
    });
    rects.sort(([idA, a], [idB, b]) => a.y - b.y || compareIds(idA, idB));
    let floor = Number.NEGATIVE_INFINITY;
    for (const [index, [id, rect]] of rects.entries()) {
      const y =
        index === 0
          ? nearestFreeY(rect.y, rect, pinned, input.margin)
          : lowestClearY(
              { ...rect, y: Math.max(rect.y, floor) },
              pinned,
              input.margin,
            );
      result[id] = { x: rect.x, y };
      floor = y + rect.height + input.margin;
    }
  }
  return result;
}
