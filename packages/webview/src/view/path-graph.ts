import type { NodeId, PathInfo, PathRoute } from "@code-spider/core/types";
import { hasCodeRegion } from "../graph/nodes/node-size.js";
import type { PathFoundMessage } from "../host/protocol.js";
import { graphFromSlice, joinsNodes } from "./graph-state.js";
import type { GraphState } from "./types.js";

function addedBy<T extends { id: string }>(
  existing: Record<string, T>,
  incoming: readonly T[],
  replace: boolean,
): Record<string, T> | undefined {
  const merged = { ...existing };
  let changed = false;
  for (const item of incoming) {
    if (Object.hasOwn(merged, item.id) && !replace) continue;
    merged[item.id] = item;
    changed = true;
  }
  return changed ? merged : undefined;
}

/**
 * Adds the route's nodes and edges by id and sets `path`. A route is not a
 * slice, so the slice records are never touched. With `replace` the route's
 * data wins over what is already there.
 */
export function withRoute(
  graph: GraphState,
  route: PathRoute,
  path: PathInfo,
  replace: boolean,
): GraphState {
  const nodes = addedBy(graph.nodes, route.nodes, replace);
  const allNodes = nodes ?? graph.nodes;
  const edges = addedBy(
    graph.edges,
    route.edges.filter((edge) => joinsNodes(edge, allNodes)),
    replace,
  );
  return {
    ...graph,
    nodes: allNodes,
    edges: edges ?? graph.edges,
    path,
    revision: nodes || edges ? graph.revision + 1 : graph.revision,
  };
}

function opened(graph: GraphState, endId: NodeId): NodeId[] {
  const end = graph.nodes[endId];
  const open = graph.open ?? [];
  return end && hasCodeRegion(end) && !open.includes(endId)
    ? [...open, endId]
    : open;
}

/** A's ordinary neighbourhood with the route merged in; both ends open. */
export function graphFromPath(
  message: Pick<PathFoundMessage, "slice" | "route" | "path">,
  project: string,
): GraphState {
  const routed = withRoute(
    graphFromSlice(message.slice, project),
    message.route,
    message.path,
    false,
  );
  return { ...routed, open: opened(routed, message.path.endId) };
}
