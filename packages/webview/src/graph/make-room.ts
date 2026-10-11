import type { NodeId } from "@code-spider/core/types";
import { rowGap } from "../column-gap.js";
import type { Point } from "../view/types.js";
import { compareIds } from "./compare-ids.js";
import { isClear, type Rect } from "./placement.js";

export type RoomBox = { id: NodeId; rect: Rect };

const inOrder = (a: RoomBox, b: RoomBox) =>
  a.rect.y - b.rect.y || a.rect.x - b.rect.x || compareIds(a.id, b.id);

function lowestClearY(
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

/**
 * Slides unpinned boxes down, never sideways or up, until none is closer than
 * the row gap to a pinned box or to a box before it in (top, x, id) order. A
 * moved box counts at its new y for the boxes after it. Returns only the boxes
 * that moved.
 */
export function makeRoom(
  boxes: readonly RoomBox[],
  pinned: ReadonlySet<NodeId>,
  columnGap: number,
): Record<NodeId, Point> {
  const margin = rowGap(columnGap);
  const obstacles = boxes
    .filter((box) => pinned.has(box.id))
    .map((box) => box.rect);
  const moved: Record<NodeId, Point> = {};
  for (const { id, rect } of [...boxes].sort(inOrder)) {
    if (pinned.has(id)) continue;
    const y = lowestClearY(rect, obstacles, margin);
    obstacles.push({ ...rect, y });
    if (y !== rect.y) moved[id] = { x: rect.x, y };
  }
  return moved;
}
