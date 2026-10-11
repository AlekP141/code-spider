import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { rowGap } from "../column-gap.js";
import { calledInOrder, type CallEdge } from "../graph/call-order.js";
import { compareIds } from "../graph/compare-ids.js";
import { NODE_WIDTH } from "../graph/constants.js";
import { TOLERANCE } from "../graph/placement.js";
import type { Point } from "./types.js";

export type Restack = {
  members: NodeId[];
  /** The group top to bottom: the members, plus the new boxes if restacked. */
  stack: NodeId[];
  positions: Record<NodeId, Point>;
  added: NodeId[];
};

export type RestackInput = {
  key: NodeId;
  edges: readonly CallEdge[];
  positions: Readonly<Record<NodeId, Point>>;
  kept: ReadonlySet<NodeId>;
  fresh: ReadonlySet<NodeId>;
  pinned: ReadonlySet<NodeId>;
  grouped: ReadonlySet<NodeId>;
  heights: Readonly<Record<NodeId, number>>;
  columnGap: number;
};

/**
 * Puts one function's unpinned called boxes, and the ones its slice brings, in
 * code order in the column left of it. `members` and `stack` are always
 * returned so the caller can claim and chain them; positions and `added` stay
 * empty when nothing needs to move or come in.
 */
export function restackCalled(input: RestackInput): Restack {
  const keyAt = input.positions[input.key];
  if (!keyAt) return { members: [], stack: [], positions: {}, added: [] };
  const columnX = keyAt.x - (NODE_WIDTH + input.columnGap);
  const called = calledInOrder(input.key, input.edges);
  const xOf = (nodeId: NodeId) => input.positions[nodeId]?.x ?? Number.NaN;
  const topOf = (nodeId: NodeId) => input.positions[nodeId]?.y ?? 0;
  const members = called.filter(
    (nodeId) =>
      input.kept.has(nodeId) &&
      !input.pinned.has(nodeId) &&
      !input.grouped.has(nodeId) &&
      Math.abs(xOf(nodeId) - columnX) <= TOLERANCE,
  );
  const added = called.filter((nodeId) => input.fresh.has(nodeId));
  const standing = [...members].sort(
    (a, b) => topOf(a) - topOf(b) || compareIds(a, b),
  );
  const inOrder = standing.every(
    (nodeId, at) =>
      nodeId === members[at] &&
      (at === 0 || topOf(nodeId) > topOf(standing[at - 1] ?? nodeId)),
  );
  if (members.length === 0 || (inOrder && added.length === 0)) {
    return { members, stack: members, positions: {}, added: [] };
  }

  const margin = rowGap(input.columnGap);
  const memberSet = new Set(members);
  const positions: Record<NodeId, Point> = {};
  const stack: NodeId[] = [];
  let top = Math.min(...members.map(topOf));
  for (const nodeId of called) {
    if (!memberSet.has(nodeId) && !input.fresh.has(nodeId)) continue;
    const x = memberSet.has(nodeId) ? xOf(nodeId) : columnX;
    positions[nodeId] = { x, y: top };
    stack.push(nodeId);
    top += (input.heights[nodeId] ?? 0) + margin;
  }
  return { members, stack, positions, added };
}

export type Applied = { key: NodeId; slice: GraphSlice };

/** New nodes go to the first applied slice that lists them. */
export function freshPerSlice(
  applied: readonly Applied[],
  kept: ReadonlySet<NodeId>,
): NodeId[][] {
  const claimed = new Set(kept);
  return applied.map(({ slice }) => {
    const own = slice.nodes.filter((node) => !claimed.has(node.id));
    for (const node of own) claimed.add(node.id);
    return own.map((node) => node.id);
  });
}

export type RestackPass = {
  positions: Record<NodeId, Point>;
  chains: NodeId[][];
  added: NodeId[];
};

/** A box joins only the first group that claims it. */
export function restackPass(input: {
  applied: readonly Applied[];
  fresh: readonly (readonly NodeId[])[];
  positions: Readonly<Record<NodeId, Point>>;
  pinned: ReadonlySet<NodeId>;
  heights: Readonly<Record<NodeId, number>>;
  columnGap: number;
}): RestackPass {
  const kept = new Set(Object.keys(input.positions));
  const grouped = new Set<NodeId>();
  const chains: NodeId[][] = [];
  const added: NodeId[] = [];
  let positions = { ...input.positions };
  for (const [index, { key, slice }] of input.applied.entries()) {
    const restack = restackCalled({
      key,
      edges: slice.edges,
      positions,
      kept,
      fresh: new Set(input.fresh[index]),
      pinned: input.pinned,
      grouped,
      heights: input.heights,
      columnGap: input.columnGap,
    });
    positions = { ...positions, ...restack.positions };
    for (const nodeId of restack.members) grouped.add(nodeId);
    chains.push(restack.stack);
    added.push(...restack.added);
  }
  return { positions, chains, added };
}
