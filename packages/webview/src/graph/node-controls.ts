import type { GraphNode, NodeId } from "@code-spider/core/types";
import { isExpanded } from "../view/graph-state.js";
import type { GraphState } from "../view/types.js";

export type NodeUi = { busy: boolean; loading: readonly NodeId[] };

export type NodeControl =
  | "none"
  | "expand"
  | "expandDisabled"
  | "loading"
  | "collapse";

function isWalkable(node: GraphNode): boolean {
  return node.kind === "function" || node.kind === "component";
}

export function canRecentre(node: GraphNode, graph: GraphState): boolean {
  return node.id !== graph.focusId && isWalkable(node);
}

export function nodeControl(
  node: GraphNode,
  graph: GraphState,
  ui: NodeUi,
): NodeControl {
  if (!canRecentre(node, graph)) return "none";
  if (ui.loading.includes(node.id)) return "loading";
  if (isExpanded(graph, node.id)) return "collapse";
  return ui.busy ? "expandDisabled" : "expand";
}
