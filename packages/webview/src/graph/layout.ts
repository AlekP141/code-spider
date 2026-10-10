import type { NodeId } from "@code-spider/core/types";
import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { Point } from "../view/types.js";
import type { SpiderFlowEdge, SpiderFlowNode } from "./to-flow.js";

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
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": String(columnGap),
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
