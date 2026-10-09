import type { GraphNode, GraphSlice } from "@code-spider/core";
import type { Edge, Node } from "@xyflow/react";
import { MAX_EDGE_LABEL_CHARS, NODE_WIDTH } from "./constants.js";
import { edgeAppearance } from "./edge-appearance.js";
import { nodeHeight } from "./node-size.js";

export type SpiderNodeData = { node: GraphNode; isFocus: boolean };
export type SpiderFlowNode = Node<SpiderNodeData, "spider">;
export type SpiderEdgeData = { fullLabel: string };
export type SpiderFlowEdge = Edge<SpiderEdgeData>;

export function truncateLabel(
  text: string,
  max: number = MAX_EDGE_LABEL_CHARS,
): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function toFlow(slice: GraphSlice): {
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
} {
  const ids = new Set(slice.nodes.map((node) => node.id));

  const nodes = slice.nodes.map((node): SpiderFlowNode => ({
    id: node.id,
    type: "spider",
    position: { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: nodeHeight(node),
    data: { node, isFocus: node.id === slice.focusId },
  }));

  const edges = slice.edges
    .filter((edge) => ids.has(edge.from) && ids.has(edge.to))
    .map((edge): SpiderFlowEdge => {
      const appearance = edgeAppearance(edge.kind, edge.resolved);
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
        label: edge.supplies === "" ? undefined : truncateLabel(edge.supplies),
        className: appearance.className,
        style: {
          strokeDasharray: appearance.strokeDasharray,
          strokeWidth: appearance.strokeWidth,
        },
        data: { fullLabel: edge.supplies },
      };
    });

  return { nodes, edges };
}
