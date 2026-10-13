import type { NodeId } from "@code-spider/core/types";
import { isOpen } from "../../view/graph-state.js";
import type { GraphState } from "../../view/types.js";
import { NODE_WIDTH } from "../constants.js";
import { nodeHeight } from "../nodes/node-size.js";
import { boundingRect } from "./pan-to-reveal.js";
import type { Rect } from "../layout/placement.js";

export function revealRect(
  graph: GraphState,
  ids: readonly NodeId[],
): Rect | undefined {
  const rects = ids.flatMap((nodeId) => {
    const node = graph.nodes[nodeId];
    const at = graph.positions[nodeId];
    if (!node || !at) return [];
    const height = nodeHeight(node, isOpen(graph, nodeId));
    return [{ ...at, width: NODE_WIDTH, height }];
  });
  return boundingRect(rects);
}
