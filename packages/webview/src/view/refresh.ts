import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { walkParents } from "../graph/call-order.js";
import { NODE_WIDTH } from "../graph/constants.js";
import { makeRoom, type RoomBox } from "../graph/make-room.js";
import { nodeHeight } from "../graph/node-size.js";
import { placeExpansion } from "../graph/placement.js";
import type { ExtensionToWebview } from "../protocol.js";
import { rectsOf } from "./expansion.js";
import { graphFromSlice, isExpanded, mergeExpansion } from "./graph-state.js";
import { freshPerSlice, restackPass, type Applied } from "./refresh-order.js";
import type { GraphState, Point } from "./types.js";

export type RefreshAnswer = Extract<ExtensionToWebview, { type: "refreshed" }>;

/** `added` holds the nodes that had no position to keep. */
export type Rebuilt = { graph: GraphState; added: NodeId[] };

/** Like `mergeExpansion`, but a node or edge already there is replaced. */
function applySlice(
  graph: GraphState,
  key: NodeId,
  slice: GraphSlice,
): GraphState {
  const merged = mergeExpansion(graph, key, slice).graph;
  const nodes = { ...merged.nodes };
  for (const node of slice.nodes) nodes[node.id] = node;
  const edges = { ...merged.edges };
  for (const edge of slice.edges) {
    if (Object.hasOwn(edges, edge.id)) edges[edge.id] = edge;
  }
  return { ...merged, nodes, edges };
}

/**
 * Each pass applies the expansions that qualify against the graph as the pass
 * began, in the order the user expanded them, so the answer's order is moot.
 */
function rebuildSlices(
  current: GraphState,
  answer: RefreshAnswer,
): { graph: GraphState; applied: Applied[] } {
  let graph = graphFromSlice(answer.centre, current.project);
  const applied: Applied[] = [
    { key: answer.centre.focusId, slice: answer.centre },
  ];
  const done = new Set<NodeId>([answer.centre.focusId]);
  const recorded = Object.keys(current.slices);
  for (;;) {
    const ready = answer.expansions
      .filter(
        ({ nodeId, slice }) =>
          !done.has(nodeId) &&
          Object.hasOwn(graph.nodes, nodeId) &&
          isExpanded(current, nodeId) &&
          slice.focusId === nodeId,
      )
      .sort(
        (a, b) => recorded.indexOf(a.nodeId) - recorded.indexOf(b.nodeId),
      );
    if (ready.length === 0) return { graph, applied };
    for (const { nodeId, slice } of ready) {
      if (done.has(nodeId)) continue;
      done.add(nodeId);
      graph = applySlice(graph, nodeId, slice);
      applied.push({ key: nodeId, slice });
    }
  }
}

function keptBoxes(
  graph: GraphState,
  positions: Record<NodeId, Point>,
): RoomBox[] {
  return Object.entries(positions).flatMap(([nodeId, at]) => {
    const node = graph.nodes[nodeId];
    if (!node) return [];
    const rect = { ...at, width: NODE_WIDTH, height: nodeHeight(node) };
    return [{ id: nodeId, rect }];
  });
}

function placePass(input: {
  rebuilt: GraphState;
  applied: readonly Applied[];
  fresh: readonly (readonly NodeId[])[];
  positions: Record<NodeId, Point>;
  heights: Readonly<Record<NodeId, number>>;
  columnGap: number;
}): { positions: Record<NodeId, Point>; added: NodeId[] } {
  let positions = input.positions;
  const added: NodeId[] = [];
  for (const [index, { key, slice }] of input.applied.entries()) {
    const unplaced = (input.fresh[index] ?? []).filter(
      (nodeId) => !Object.hasOwn(positions, nodeId),
    );
    if (unplaced.length === 0) continue;
    const placed = placeExpansion({
      expandedId: key,
      anchor: {
        ...(positions[key] ?? { x: 0, y: 0 }),
        width: NODE_WIDTH,
        height: input.heights[key] ?? 0,
      },
      added: unplaced.map((nodeId) => ({
        id: nodeId,
        height: input.heights[nodeId] ?? 0,
      })),
      edges: slice.edges,
      existing: rectsOf({ ...input.rebuilt, positions }),
      columnGap: input.columnGap,
    });
    positions = { ...positions, ...placed };
    added.push(...Object.keys(placed));
  }
  return { positions, added };
}

/**
 * The graph a refresh answer describes, with the user's positions and pins
 * kept, the boxes that grew given room, and the new nodes placed around the
 * box whose slice first listed them. `current` is the graph as the answer
 * arrives; the caller has checked the answer belongs to it.
 */
export function rebuildGraph(
  current: GraphState,
  answer: RefreshAnswer,
  columnGap: number,
): Rebuilt {
  const { graph: rebuilt, applied } = rebuildSlices(current, answer);
  const has = (nodeId: NodeId) => Object.hasOwn(rebuilt.nodes, nodeId);
  const pinned = current.pinned.filter(has);
  const pinnedIds = new Set(pinned);
  const kept = Object.fromEntries(
    Object.entries(current.positions).filter(([nodeId]) => has(nodeId)),
  );
  const heights = Object.fromEntries(
    Object.values(rebuilt.nodes).map((node) => [node.id, nodeHeight(node)]),
  );
  const owners = walkParents(rebuilt);
  const fresh = freshPerSlice(applied, new Set(Object.keys(kept)), owners);

  const restacked = restackPass({
    applied,
    fresh,
    positions: kept,
    owners,
    pinned: pinnedIds,
    heights,
    columnGap,
  });
  const room = makeRoom(
    keptBoxes(rebuilt, restacked.positions),
    pinnedIds,
    columnGap,
    restacked.chains,
  );
  const placed = placePass({
    rebuilt,
    applied,
    fresh,
    positions: { ...restacked.positions, ...room },
    heights,
    columnGap,
  });
  const positions = placed.positions;
  const added = [...restacked.added, ...placed.added];

  return {
    graph: {
      ...rebuilt,
      generation: current.generation,
      focusId: current.focusId,
      ...(current.columnGap === undefined
        ? {}
        : { columnGap: current.columnGap }),
      positions,
      pinned,
      revision: current.revision + 1,
      sourceVersion: answer.sourceVersion,
    },
    added,
  };
}
