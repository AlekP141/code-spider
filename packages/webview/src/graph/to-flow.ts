import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core/types";
import type { Edge, Node } from "@xyflow/react";
import type { PathMark } from "../host/protocol.js";
import { DEFAULT_EDGE_STYLE, type EdgeStyle } from "../settings/edge-style.js";
import { isOpen } from "../view/graph-state.js";
import type { GraphState } from "../view/types.js";
import { NODE_WIDTH } from "./constants.js";
import { edgeAppearance } from "./edge-appearance.js";
import { nodeHeight } from "./nodes/node-size.js";
import { supplierLabels, type LabelLine } from "./nodes/supplier-labels.js";

export type SpiderNodeData = {
  node: GraphNode;
  isFocus: boolean;
  pinned: boolean;
  open: boolean;
  labels: readonly LabelLine[];
  /** The path fields are present only on a path graph or while a mark shows. */
  onRoute?: boolean;
  tag?: "A" | "B";
  marked?: boolean;
  routeHandles?: boolean;
};
export type SpiderFlowNode = Node<SpiderNodeData, "spider">;
export type SpiderFlowEdge = Edge;

export type FlowOptions = { mark?: PathMark };

type RouteIndex = {
  columns: ReadonlyMap<NodeId, number>;
  edgeIds: ReadonlySet<string>;
};

function routeIndex(graph: GraphState): RouteIndex | undefined {
  const { path } = graph;
  if (!path) return undefined;
  return {
    columns: new Map(path.boxes.map((box) => [box.id, box.column])),
    edgeIds: new Set(path.edgeIds),
  };
}

function pathData(
  node: GraphNode,
  graph: GraphState,
  route: RouteIndex | undefined,
  mark: PathMark | undefined,
): Partial<SpiderNodeData> {
  if (!route && !mark) return {};
  let tag: SpiderNodeData["tag"];
  if (route && node.id === graph.focusId) tag = "A";
  if (route && node.id === graph.path?.endId) tag = "B";
  return {
    onRoute: route?.columns.has(node.id) ?? false,
    tag,
    marked: mark?.project === graph.project && mark.nodeId === node.id,
    routeHandles: route !== undefined,
  };
}

function toFlowNode(
  node: GraphNode,
  graph: GraphState,
  labels: ReadonlyMap<NodeId, LabelLine[]>,
  route: RouteIndex | undefined,
  mark: PathMark | undefined,
): SpiderFlowNode {
  const open = isOpen(graph, node.id);
  const height = nodeHeight(node, open);
  return {
    id: node.id,
    type: "spider",
    position: graph.positions[node.id] ?? { x: 0, y: 0 },
    width: NODE_WIDTH,
    height,
    measured: { width: NODE_WIDTH, height },
    data: {
      node,
      isFocus: node.id === graph.focusId,
      pinned: graph.pinned.includes(node.id),
      open,
      labels: labels.get(node.id) ?? [],
      ...pathData(node, graph, route, mark),
    },
  };
}

const ROUTE_STROKE_WIDTH = 4;

const EDGE_TYPES: Record<EdgeStyle, string> = {
  stepped: "smoothstep",
  curved: "default",
};

/** A route edge running back a column leaves left and enters on the right. */
function routeEdge(
  flow: SpiderFlowEdge,
  edge: GraphEdge,
  route: RouteIndex,
): SpiderFlowEdge {
  const from = route.columns.get(edge.from);
  const to = route.columns.get(edge.to);
  const backward = from !== undefined && to !== undefined && to < from;
  return {
    ...flow,
    className: `${flow.className} edge-route`,
    style: { ...flow.style, strokeWidth: ROUTE_STROKE_WIDTH },
    ...(backward
      ? { sourceHandle: "source-left", targetHandle: "target-right" }
      : {}),
  };
}

function toFlowEdge(
  edge: GraphEdge,
  source: GraphNode | undefined,
  target: GraphNode | undefined,
  edgeStyle: EdgeStyle,
  route: RouteIndex | undefined,
): SpiderFlowEdge {
  const appearance = edgeAppearance(
    edge.kind,
    edge.resolved,
    source?.isTest === true || target?.isTest === true,
  );
  const change = source?.change ? ` edge-change-${source.change}` : "";
  const flow: SpiderFlowEdge = {
    id: edge.id,
    source: edge.from,
    target: edge.to,
    type: EDGE_TYPES[edgeStyle],
    className: appearance.className + change,
    style: {
      strokeDasharray: appearance.strokeDasharray,
      strokeWidth: appearance.strokeWidth,
    },
  };
  return route?.edgeIds.has(edge.id) ? routeEdge(flow, edge, route) : flow;
}

export function toFlow(
  graph: GraphState,
  edgeStyle: EdgeStyle = DEFAULT_EDGE_STYLE,
  options: FlowOptions = {},
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
  const route = routeIndex(graph);
  return {
    nodes: Object.values(graph.nodes).map((node) =>
      toFlowNode(node, graph, labels, route, options.mark),
    ),
    edges: drawn.map((edge) =>
      toFlowEdge(
        edge,
        graph.nodes[edge.from],
        graph.nodes[edge.to],
        edgeStyle,
        route,
      ),
    ),
  };
}
