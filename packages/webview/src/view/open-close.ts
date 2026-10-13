import type { NodeId } from "@code-spider/core/types";
import { makeRoom } from "../graph/layout/make-room.js";
import { hasCodeRegion } from "../graph/nodes/node-size.js";
import { isOpen } from "./graph-state.js";
import { roomBoxes } from "./room-boxes.js";
import type { GraphState } from "./types.js";

/**
 * Shows the box's code and pushes unpinned boxes down to make room. The opened
 * box is fixed for the push so a box above it in the sort order cannot move it.
 */
export function openNode(
  graph: GraphState,
  nodeId: NodeId,
  columnGap: number,
): GraphState {
  const node = graph.nodes[nodeId];
  if (!node || !hasCodeRegion(node) || isOpen(graph, nodeId)) return graph;
  const opened = { ...graph, open: [...(graph.open ?? []), nodeId] };
  const fixed = new Set([...graph.pinned, nodeId]);
  const moved = makeRoom(roomBoxes(opened), fixed, columnGap);
  return {
    ...opened,
    positions: { ...graph.positions, ...moved },
    revision: graph.revision + 1,
  };
}

/** Hides the box's code. Nothing moves; Tidy packs the graph again. */
export function closeNode(graph: GraphState, nodeId: NodeId): GraphState {
  if (!isOpen(graph, nodeId)) return graph;
  return {
    ...graph,
    open: (graph.open ?? []).filter((id) => id !== nodeId),
    revision: graph.revision + 1,
  };
}
