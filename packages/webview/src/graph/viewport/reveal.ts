import type { NodeId } from "@code-spider/core/types";
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
    return [{ ...at, width: NODE_WIDTH, height: nodeHeight(node) }];
  });
  return boundingRect(rects);
}
