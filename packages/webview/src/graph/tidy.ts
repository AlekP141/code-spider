import type { NodeId } from "@code-spider/core/types";
import type { Point } from "../view/types.js";
import { compareIds } from "./compare-ids.js";
import {
  isClear,
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
 * ELK's positions for everything unpinned, the current positions for the
 * pinned. An unpinned node that ELK put too close to a pinned one is displaced:
 * it keeps its column and takes the nearest free y. Displaced nodes are placed
 * in (x, y, id) order against the pinned, the undisplaced and those placed
 * before them.
 */
export function tidyPositions(input: TidyInput): Record<NodeId, Point> {
  const result: Record<NodeId, Point> = {};
  const obstacles: Rect[] = [];
  const unpinned: [NodeId, Rect][] = [];
  for (const [id, size] of Object.entries(input.sizes)) {
    const fixed = input.pinned[id];
    const laidOut = input.elk[id];
    if (fixed) {
      result[id] = fixed;
      obstacles.push({ ...fixed, ...size });
    } else if (laidOut) {
      unpinned.push([id, { ...laidOut, ...size }]);
    }
  }

  const pinnedRects = [...obstacles];
  const displaced: [NodeId, Rect][] = [];
  for (const entry of unpinned) {
    const [id, rect] = entry;
    if (pinnedRects.every((pin) => isClear(rect, pin, input.margin))) {
      result[id] = { x: rect.x, y: rect.y };
      obstacles.push(rect);
    } else {
      displaced.push(entry);
    }
  }

  displaced.sort(
    ([idA, a], [idB, b]) => a.x - b.x || a.y - b.y || compareIds(idA, idB),
  );
  for (const [id, rect] of displaced) {
    const y = nearestFreeY(rect.y, rect, obstacles, input.margin);
    result[id] = { x: rect.x, y };
    obstacles.push({ ...rect, y });
  }
  return result;
}
