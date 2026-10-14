import type { GraphNode, NodeId } from "@code-spider/core/types";
import type { ChangeKind } from "../host/protocol.js";
import type { GraphState } from "./types.js";

function marked(node: GraphNode, kind: ChangeKind | undefined): GraphNode {
  if (kind) return { ...node, change: kind };
  const { change: _removed, ...unmarked } = node;
  return unmarked;
}

/** Only `change` is rewritten; the same graph comes back when none differs. */
export function withChangeMarks(
  graph: GraphState,
  marks: Record<NodeId, ChangeKind>,
): GraphState {
  let nodes: Record<NodeId, GraphNode> | undefined;
  for (const [id, node] of Object.entries(graph.nodes)) {
    const kind = Object.hasOwn(marks, id) ? marks[id] : undefined;
    if (node.change === kind) continue;
    nodes ??= { ...graph.nodes };
    nodes[id] = marked(node, kind);
  }
  return nodes ? { ...graph, nodes } : graph;
}
