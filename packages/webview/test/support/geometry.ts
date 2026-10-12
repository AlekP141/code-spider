import type { NodeId } from "@code-spider/core/types";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { nodeHeight } from "../../src/graph/nodes/node-size.js";
import type { Rect } from "../../src/graph/layout/placement.js";
import type { GraphState } from "../../src/view/types.js";
import { site } from "./slices.js";

export const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
): Rect => ({ x, y, width, height });

export const edge = (from: string, to: string, line = 2) => ({
  from,
  to,
  callSite: site(line),
});

export function rectOf(graph: GraphState, nodeId: NodeId): Rect {
  const at = graph.positions[nodeId] ?? { x: Number.NaN, y: Number.NaN };
  const node = graph.nodes[nodeId];
  return {
    ...at,
    width: NODE_WIDTH,
    height: node ? nodeHeight(node) : Number.NaN,
  };
}
