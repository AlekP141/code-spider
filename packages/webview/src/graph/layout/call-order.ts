import type { GraphEdge, NodeId, Range } from "@code-spider/core/types";
import type { GraphState } from "../../view/types.js";
import { compareIds } from "./compare-ids.js";

export type CallEdge = Pick<GraphEdge, "from" | "to" | "callSite">;

const bySite = (a: Range, b: Range) =>
  a.startLine - b.startLine ||
  a.startColumn - b.startColumn ||
  a.endLine - b.endLine ||
  a.endColumn - b.endColumn;

/** The functions `nodeId` uses, in the order their first use is read. */
export function calledInOrder(
  nodeId: NodeId,
  edges: Iterable<CallEdge>,
): NodeId[] {
  const firstSite = new Map<NodeId, Range>();
  for (const edge of edges) {
    if (edge.to !== nodeId || edge.from === nodeId) continue;
    const known = firstSite.get(edge.from);
    if (!known || bySite(edge.callSite, known) < 0) {
      firstSite.set(edge.from, edge.callSite);
    }
  }
  return [...firstSite]
    .sort(([idA, a], [idB, b]) => bySite(a, b) || compareIds(idA, idB))
    .map(([supplier]) => supplier);
}

function pushTo(
  map: Map<NodeId, CallEdge[]>,
  key: NodeId,
  edge: CallEdge,
): void {
  const list = map.get(key);
  if (list) list.push(edge);
  else map.set(key, [edge]);
}

type Walkable = Pick<GraphState, "focusId" | "nodes" | "edges">;
type Walk = { order: NodeId[]; parents: Map<NodeId, NodeId> };

function walk(graph: Walkable): Walk {
  const hasNode = (nodeId: NodeId) => Object.hasOwn(graph.nodes, nodeId);
  const edgesInto = new Map<NodeId, CallEdge[]>();
  const callersOf = new Map<NodeId, Set<NodeId>>();
  for (const edge of Object.values(graph.edges)) {
    if (!hasNode(edge.from) || !hasNode(edge.to)) continue;
    pushTo(edgesInto, edge.to, edge);
    const callers = callersOf.get(edge.from) ?? new Set<NodeId>();
    callers.add(edge.to);
    callersOf.set(edge.from, callers);
  }

  const visited = new Set<NodeId>();
  const order: NodeId[] = [];
  const parents = new Map<NodeId, NodeId>();
  const visit = (nodeId: NodeId, parent?: NodeId): void => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    order.push(nodeId);
    if (parent !== undefined) parents.set(nodeId, parent);
    for (const called of calledInOrder(nodeId, edgesInto.get(nodeId) ?? [])) {
      visit(called, nodeId);
    }
    for (const caller of [...(callersOf.get(nodeId) ?? [])].sort(compareIds)) {
      visit(caller);
    }
  };

  if (hasNode(graph.focusId)) visit(graph.focusId);
  for (const nodeId of Object.keys(graph.nodes).sort(compareIds)) {
    visit(nodeId);
  }
  return { order, parents };
}

/**
 * Depth first from the focus: a node, then its called functions in code order,
 * then its callers in id order. Nodes never reached follow in id order.
 */
export function walkOrder(graph: Walkable): NodeId[] {
  return walk(graph).order;
}

/**
 * The owner of each box that the walk first reached as a called function: the
 * function whose called list it came from. The focus, a box first reached as a
 * caller, and a box the walk never reached from the focus have no owner.
 */
export function walkParents(graph: Walkable): ReadonlyMap<NodeId, NodeId> {
  return walk(graph).parents;
}
