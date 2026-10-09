import ELK, { type ElkNode } from "elkjs/lib/elk.bundled.js";
import type { SpiderFlowEdge, SpiderFlowNode } from "./to-flow.js";

export type Positions = Map<string, { x: number; y: number }>;

const elk = new ELK();

export function buildElkGraph(
  nodes: readonly SpiderFlowNode[],
  edges: readonly SpiderFlowEdge[],
): ElkNode {
  return {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
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

export function applyPositions(
  nodes: readonly SpiderFlowNode[],
  positions: Positions,
): SpiderFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    position: positions.get(node.id) ?? node.position,
  }));
}

export async function layoutPositions(
  nodes: readonly SpiderFlowNode[],
  edges: readonly SpiderFlowEdge[],
): Promise<Positions> {
  const laidOut = await elk.layout(buildElkGraph(nodes, edges));
  const positions: Positions = new Map();
  for (const child of laidOut.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  return positions;
}
