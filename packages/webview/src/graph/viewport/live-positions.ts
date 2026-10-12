import type { NodeId } from "@code-spider/core/types";
import type { Point } from "../../view/types.js";
import type { SpiderFlowNode } from "../to-flow.js";

/** Where dragged nodes are right now, tied to the graph they were dragged in. */
export type LivePositions = {
  generation: number;
  positions: Record<NodeId, Point>;
};

export function recordLive(
  previous: LivePositions | undefined,
  generation: number,
  moved: readonly (readonly [NodeId, Point])[],
): LivePositions {
  const kept = previous?.generation === generation ? previous.positions : {};
  return { generation, positions: { ...kept, ...Object.fromEntries(moved) } };
}

export function applyLive(
  nodes: SpiderFlowNode[],
  live: LivePositions | undefined,
  generation: number,
): SpiderFlowNode[] {
  if (live?.generation !== generation) return nodes;
  return nodes.map((node) => {
    const at = live.positions[node.id];
    return at ? { ...node, position: at } : node;
  });
}
