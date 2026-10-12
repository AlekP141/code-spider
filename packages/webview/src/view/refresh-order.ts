import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { rowGap } from "../settings/column-gap.js";
import { calledInOrder, type CallEdge } from "../graph/layout/call-order.js";
import { compareIds } from "../graph/layout/compare-ids.js";
import { NODE_WIDTH } from "../graph/constants.js";
import { TOLERANCE } from "../graph/layout/placement.js";
import type { Point } from "./types.js";

type Restack = {
  members: NodeId[];
  /** The group top to bottom: the members, plus the new boxes if restacked. */
  stack: NodeId[];
  positions: Record<NodeId, Point>;
  added: NodeId[];
};

type RestackInput = {
  key: NodeId;
  edges: readonly CallEdge[];
  positions: Readonly<Record<NodeId, Point>>;
  kept: ReadonlySet<NodeId>;
  fresh: ReadonlySet<NodeId>;
  pinned: ReadonlySet<NodeId>;
  /** Boxes that belong to no group of this function. */
  excluded: ReadonlySet<NodeId>;
  heights: Readonly<Record<NodeId, number>>;
  columnGap: number;
};

/** The x most boxes share; a tie goes to the one nearest `expected`. */
function sharedX(xs: readonly number[], expected: number): number | undefined {
  let best: { x: number; count: number } | undefined;
  for (const x of xs) {
    const count = xs.filter((other) => Math.abs(other - x) <= TOLERANCE).length;
    const nearer =
      best !== undefined &&
      count === best.count &&
      Math.abs(x - expected) < Math.abs(best.x - expected);
    if (best === undefined || count > best.count || nearer) best = { x, count };
  }
  return best?.x;
}

/**
 * Puts one function's unpinned called boxes, and the ones its slice brings, in
 * code order in their column. The column is the x most of those boxes that
 * stand left of the function share. `members` and `stack` are always returned
 * so the caller can claim and chain them; positions and `added` stay empty when
 * nothing needs to move or come in.
 */
function restackCalled(input: RestackInput): Restack {
  const keyAt = input.positions[input.key];
  const none: Restack = { members: [], stack: [], positions: {}, added: [] };
  if (!keyAt) return none;
  const called = calledInOrder(input.key, input.edges);
  const xOf = (nodeId: NodeId) => input.positions[nodeId]?.x ?? Number.NaN;
  const topOf = (nodeId: NodeId) => input.positions[nodeId]?.y ?? 0;
  const candidates = called.filter(
    (nodeId) =>
      input.kept.has(nodeId) &&
      !input.pinned.has(nodeId) &&
      !input.excluded.has(nodeId) &&
      xOf(nodeId) + NODE_WIDTH <= keyAt.x + TOLERANCE,
  );
  const columnX = sharedX(
    candidates.map(xOf),
    keyAt.x - (NODE_WIDTH + input.columnGap),
  );
  if (columnX === undefined) return none;
  const members = candidates.filter(
    (nodeId) => Math.abs(xOf(nodeId) - columnX) <= TOLERANCE,
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
  if (inOrder && added.length === 0) {
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

type Owners = ReadonlyMap<NodeId, NodeId>;

/**
 * A new node goes to the function that owns it when that function's slice
 * lists it, so the next refresh finds it in the same group; otherwise to the
 * first applied slice that lists it.
 */
export function freshPerSlice(
  applied: readonly Applied[],
  kept: ReadonlySet<NodeId>,
  owners: Owners,
): NodeId[][] {
  const listed = applied.map(
    ({ slice }) => new Set(slice.nodes.map((node) => node.id)),
  );
  const claimed = new Set(kept);
  const fresh: NodeId[][] = applied.map(() => []);
  for (const [at, { slice }] of applied.entries()) {
    for (const node of slice.nodes) {
      if (claimed.has(node.id)) continue;
      claimed.add(node.id);
      const owner = owners.get(node.id);
      const ownerAt = applied.findIndex(({ key }) => key === owner);
      const target = listed[ownerAt]?.has(node.id) ? ownerAt : at;
      fresh[target]?.push(node.id);
    }
  }
  return fresh;
}

type RestackPass = {
  positions: Record<NodeId, Point>;
  chains: NodeId[][];
  added: NodeId[];
};

/**
 * A box joins only the first group that claims it, and only the group of the
 * function that owns it.
 */
export function restackPass(input: {
  applied: readonly Applied[];
  fresh: readonly (readonly NodeId[])[];
  positions: Readonly<Record<NodeId, Point>>;
  owners: Owners;
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
    const excluded = new Set(grouped);
    for (const nodeId of kept) {
      if (input.owners.get(nodeId) !== key) excluded.add(nodeId);
    }
    const restack = restackCalled({
      key,
      edges: slice.edges,
      positions,
      kept,
      fresh: new Set(input.fresh[index]),
      pinned: input.pinned,
      excluded,
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
