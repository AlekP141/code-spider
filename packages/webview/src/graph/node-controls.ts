import type { GraphNode, NodeId } from "@code-spider/core/types";
import { isExpanded } from "../view/graph-state.js";
import type { GraphState } from "../view/types.js";

export type NodeUi = {
  busy: boolean;
  loading: readonly NodeId[];
  refreshing: boolean;
};

export type NodeControl =
  | "none"
  | "expand"
  | "expandDisabled"
  | "loading"
  | "collapse"
  | "collapseDisabled";

function isWalkable(node: GraphNode, graph: GraphState): boolean {
  return (
    node.id !== graph.focusId &&
    (node.kind === "function" || node.kind === "component")
  );
}

export function nodeControl(
  node: GraphNode,
  graph: GraphState,
  ui: NodeUi,
): NodeControl {
  if (!isWalkable(node, graph)) return "none";
  if (ui.loading.includes(node.id)) return "loading";
  if (isExpanded(graph, node.id)) {
    return ui.refreshing ? "collapseDisabled" : "collapse";
  }
  return ui.busy || ui.refreshing ? "expandDisabled" : "expand";
}

export function doubleClickAction(
  node: GraphNode,
  graph: GraphState,
  ui: NodeUi,
): "expand" | "collapse" | "none" {
  const control = nodeControl(node, graph, ui);
  if (control === "expand" || control === "collapse") return control;
  return "none";
}

/** The second click of a double-click on the pin icon lands on the header. */
export const UNPIN_GUARD_MS = 500;

export type LastUnpin = { nodeId: NodeId; at: number } | undefined;

export function justUnpinned(
  last: LastUnpin,
  nodeId: NodeId,
  now: number,
): boolean {
  return last?.nodeId === nodeId && now - last.at < UNPIN_GUARD_MS;
}
