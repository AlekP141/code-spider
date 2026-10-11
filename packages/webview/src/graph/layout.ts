import type { NodeId } from "@code-spider/core/types";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import { rowGap } from "../column-gap.js";
import type { GraphState, Point } from "../view/types.js";
import { walkOrder } from "./call-order.js";
import { compareIds } from "./compare-ids.js";
import { orderColumns } from "./order-columns.js";
import {
  toFlow,
  type SpiderFlowEdge,
  type SpiderFlowNode,
} from "./to-flow.js";

export type Positions = Record<NodeId, Point>;

const elk = new ELK();

export function buildElkGraph(
  nodes: readonly SpiderFlowNode[],
  edges: readonly SpiderFlowEdge[],
  columnGap: number,
): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": String(rowGap(columnGap)),
      "elk.layered.spacing.nodeNodeBetweenLayers": String(columnGap),
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.width ?? 0,
      height: node.height ?? 0,
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };
}

export async function layoutPositions(
  nodes: readonly SpiderFlowNode[],
  edges: readonly SpiderFlowEdge[],
  columnGap: number,
): Promise<Positions> {
  const laidOut = await elk.layout(buildElkGraph(nodes, edges, columnGap));
  const positions: Positions = {};
  for (const child of laidOut.children ?? []) {
    positions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 };
  }
  return positions;
}

/** The graph's flow nodes and edges in the order ELK is given them. */
export function walkOrderedFlow(graph: GraphState): {
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
  order: NodeId[];
} {
  const order = walkOrder(graph);
  const rank = new Map(order.map((nodeId, index) => [nodeId, index]));
  const at = (nodeId: NodeId) => rank.get(nodeId) ?? order.length;
  const flow = toFlow(graph);
  return {
    order,
    nodes: flow.nodes.sort((a, b) => at(a.id) - at(b.id)),
    edges: flow.edges.sort(
      (a, b) =>
        at(a.target) - at(b.target) ||
        at(a.source) - at(b.source) ||
        compareIds(a.id, b.id),
    ),
  };
}

/**
 * ELK's layout of the graph with its nodes in code order, then each column
 * re-sorted into that order, because ELK's options only bring it close.
 */
export async function layoutGraph(
  graph: GraphState,
  columnGap: number,
): Promise<Positions> {
  const { nodes, edges, order } = walkOrderedFlow(graph);
  const positions = await layoutPositions(nodes, edges, columnGap);
  const heights = Object.fromEntries(
    nodes.map((node) => [node.id, node.height ?? 0]),
  );
  return orderColumns(positions, heights, order, rowGap(columnGap));
}
