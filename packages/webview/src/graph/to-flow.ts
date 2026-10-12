import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core/types";
import type { Edge, Node } from "@xyflow/react";
import { DEFAULT_EDGE_STYLE, type EdgeStyle } from "../settings/edge-style.js";
import type { GraphState } from "../view/types.js";
import { NODE_WIDTH } from "./constants.js";
import { edgeAppearance } from "./edge-appearance.js";
import { nodeHeight } from "./nodes/node-size.js";
import { supplierLabels, type LabelLine } from "./nodes/supplier-labels.js";

export type SpiderNodeData = {
  node: GraphNode;
  isFocus: boolean;
  pinned: boolean;
  labels: readonly LabelLine[];
};
export type SpiderFlowNode = Node<SpiderNodeData, "spider">;
export type SpiderFlowEdge = Edge;

function toFlowNode(
  node: GraphNode,
  graph: GraphState,
  labels: ReadonlyMap<NodeId, LabelLine[]>,
): SpiderFlowNode {
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
      labels: labels.get(node.id) ?? [],
    },
  };
}

const EDGE_TYPES: Record<EdgeStyle, string> = {
  stepped: "smoothstep",
  curved: "default",
};

function toFlowEdge(edge: GraphEdge, edgeStyle: EdgeStyle): SpiderFlowEdge {
  const appearance = edgeAppearance(edge.kind, edge.resolved);
  return {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: EDGE_TYPES[edgeStyle],
    className: appearance.className,
    style: {
      strokeDasharray: appearance.strokeDasharray,
      strokeWidth: appearance.strokeWidth,
    },
  };
}

export function toFlow(
  graph: GraphState,
  edgeStyle: EdgeStyle = DEFAULT_EDGE_STYLE,
): {
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
} {
  const drawn = Object.values(graph.edges).filter(
    (edge) =>
      Object.hasOwn(graph.nodes, edge.from) &&
      Object.hasOwn(graph.nodes, edge.to),
  );
  const labels = supplierLabels(drawn);
  return {
    nodes: Object.values(graph.nodes).map((node) =>
      toFlowNode(node, graph, labels),
    ),
    edges: drawn.map((edge) => toFlowEdge(edge, edgeStyle)),
  };
}
