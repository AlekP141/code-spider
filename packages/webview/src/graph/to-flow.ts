import type { GraphEdge, GraphNode } from "@code-spider/core/types";
import type { Edge, Node } from "@xyflow/react";
import type { GraphState } from "../view/types.js";
import { MAX_EDGE_LABEL_CHARS, NODE_WIDTH } from "./constants.js";
import { edgeAppearance } from "./edge-appearance.js";
import { nodeHeight } from "./node-size.js";

export type SpiderNodeData = {
  node: GraphNode;
  isFocus: boolean;
  pinned: boolean;
};
export type SpiderFlowNode = Node<SpiderNodeData, "spider">;
export type SpiderEdgeData = { fullLabel: string };
export type SpiderFlowEdge = Edge<SpiderEdgeData>;

export function truncateLabel(
  text: string,
  max: number = MAX_EDGE_LABEL_CHARS,
): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toFlowNode(node: GraphNode, graph: GraphState): SpiderFlowNode {
  return {
    id: node.id,
    type: "spider",
    position: graph.positions[node.id] ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height: nodeHeight(node),
    measured: { width: NODE_WIDTH, height: nodeHeight(node) },
    data: {
      node,
      isFocus: node.id === graph.focusId,
      pinned: graph.pinned.includes(node.id),
    },
  };
}

function toFlowEdge(edge: GraphEdge): SpiderFlowEdge {
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
}

export function toFlow(graph: GraphState): {
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
} {
  const drawn = Object.values(graph.edges).filter(
    (edge) =>
      Object.hasOwn(graph.nodes, edge.from) &&
      Object.hasOwn(graph.nodes, edge.to),
  );
  return {
    nodes: Object.values(graph.nodes).map((node) => toFlowNode(node, graph)),
    edges: drawn.map(toFlowEdge),
  };
}
