import type { NodeId } from "@code-spider/core/types";
import type { TestVisibility } from "../settings/test-visibility.js";
import type { GraphState } from "./types.js";

function neighbours(graph: GraphState): Map<NodeId, NodeId[]> {
  const around = new Map<NodeId, NodeId[]>();
  const link = (from: NodeId, to: NodeId) => {
    const list = around.get(from);
    if (list) list.push(to);
    else around.set(from, [to]);
  };
  for (const edge of Object.values(graph.edges)) {
    if (!Object.hasOwn(graph.nodes, edge.from)) continue;
    if (!Object.hasOwn(graph.nodes, edge.to)) continue;
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  return around;
}

/**
 * Hiding hides every test box but the centre, and every box with no path to the
 * centre through boxes that stay visible. Edges count in either direction.
 */
export function hiddenIds(
  graph: GraphState,
  visibility: TestVisibility,
): ReadonlySet<NodeId> {
  if (visibility === "show" || !Object.hasOwn(graph.nodes, graph.focusId)) {
    return new Set();
  }
  const around = neighbours(graph);
  const seeds = [graph.focusId, graph.path?.endId].filter(
    (id): id is NodeId => id !== undefined && Object.hasOwn(graph.nodes, id),
  );
  const reached = new Set<NodeId>(seeds);
  const pending = [...seeds];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    for (const next of around.get(id) ?? []) {
      if (reached.has(next) || graph.nodes[next]?.isTest) continue;
      reached.add(next);
      pending.push(next);
    }
  }
  return new Set(Object.keys(graph.nodes).filter((id) => !reached.has(id)));
}

function without<T>(
  record: Record<NodeId, T>,
  hidden: ReadonlySet<NodeId>,
): Record<NodeId, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([id]) => !hidden.has(id)),
  );
}

function forgetPlacement(
  graph: GraphState,
  hidden: ReadonlySet<NodeId>,
): GraphState {
  return {
    ...graph,
    positions: without(graph.positions, hidden),
    pinned: graph.pinned.filter((id) => !hidden.has(id)),
    ...(graph.open ? { open: graph.open.filter((id) => !hidden.has(id)) } : {}),
  };
}

/** What is rendered, laid out and tidied: the graph minus the hidden boxes. */
export function visibleGraph(
  graph: GraphState,
  hidden: ReadonlySet<NodeId>,
): GraphState {
  if (hidden.size === 0) return graph;
  const edges = Object.fromEntries(
    Object.entries(graph.edges).filter(
      ([, edge]) => !hidden.has(edge.from) && !hidden.has(edge.to),
    ),
  );
  return {
    ...forgetPlacement(graph, hidden),
    nodes: without(graph.nodes, hidden),
    edges,
  };
}

/** A hidden box keeps its node, edges and slices but not where it was. */
export function forgetHidden(
  graph: GraphState,
  visibility: TestVisibility,
): GraphState {
  const hidden = hiddenIds(graph, visibility);
  const remembers =
    Object.keys(graph.positions).some((id) => hidden.has(id)) ||
    graph.pinned.some((id) => hidden.has(id)) ||
    (graph.open?.some((id) => hidden.has(id)) ?? false);
  if (!remembers) return graph;
  return { ...forgetPlacement(graph, hidden), revision: graph.revision + 1 };
}
