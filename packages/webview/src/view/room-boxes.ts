import type { NodeId } from "@code-spider/core/types";
import { NODE_WIDTH } from "../graph/constants.js";
import type { RoomBox } from "../graph/layout/make-room.js";
import { nodeHeight } from "../graph/nodes/node-size.js";
import { isOpen } from "./graph-state.js";
import type { GraphState, Point } from "./types.js";

/** The positioned boxes at the height each is drawn at. */
export function roomBoxes(
  graph: GraphState,
  positions: Record<NodeId, Point> = graph.positions,
): RoomBox[] {
  return Object.entries(positions).flatMap(([nodeId, at]) => {
    const node = graph.nodes[nodeId];
    if (!node) return [];
    const height = nodeHeight(node, isOpen(graph, nodeId));
    return [{ id: nodeId, rect: { ...at, width: NODE_WIDTH, height } }];
  });
}
