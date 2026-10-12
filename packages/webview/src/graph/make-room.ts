import type { NodeId } from "@code-spider/core/types";
import { rowGap } from "../settings/column-gap.js";
import type { Point } from "../view/types.js";
import { compareIds } from "./compare-ids.js";
import { lowestClearY, type Rect } from "./placement.js";

export type RoomBox = { id: NodeId; rect: Rect };

const inOrder = (a: RoomBox, b: RoomBox) =>
  a.rect.y - b.rect.y || a.rect.x - b.rect.x || compareIds(a.id, b.id);

/**
 * Slides unpinned boxes down, never sideways or up, until none is closer than
 * the row gap to a pinned box or to a box before it in (top, x, id) order. A
 * moved box counts at its new y for the boxes after it. A chain lists boxes in
 * the order they must read top to bottom: a member never starts above the
 * nearest earlier member already placed, plus the row gap. A box belongs to at
 * most one chain. Returns only the boxes that moved.
 */
export function makeRoom(
  boxes: readonly RoomBox[],
  pinned: ReadonlySet<NodeId>,
  columnGap: number,
  chains: readonly (readonly NodeId[])[] = [],
): Record<NodeId, Point> {
  const margin = rowGap(columnGap);
  const before = new Map<NodeId, NodeId[]>();
  for (const chain of chains) {
    chain.forEach((nodeId, index) => {
      before.set(nodeId, chain.slice(0, index).reverse());
    });
  }
  const obstacles = boxes
    .filter((box) => pinned.has(box.id))
    .map((box) => box.rect);
  const bottoms = new Map<NodeId, number>();
  const moved: Record<NodeId, Point> = {};
  for (const { id, rect } of [...boxes].sort(inOrder)) {
    if (pinned.has(id)) continue;
    const earlier = (before.get(id) ?? []).find((other) => bottoms.has(other));
    const above = earlier === undefined ? undefined : bottoms.get(earlier);
    const start =
      above === undefined ? rect.y : Math.max(rect.y, above + margin);
    const y = lowestClearY({ ...rect, y: start }, obstacles, margin);
    obstacles.push({ ...rect, y });
    bottoms.set(id, y + rect.height);
    if (y !== rect.y) moved[id] = { x: rect.x, y };
  }
  return moved;
}
