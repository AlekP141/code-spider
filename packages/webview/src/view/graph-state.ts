import type { GraphSlice, NodeId } from "@code-spider/core/types";
import type { GraphState, Point, SliceRecord } from "./types.js";

export type Merged = { graph: GraphState; added: NodeId[] };

function sliceRecord(slice: GraphSlice, key: NodeId): SliceRecord {
  return {
    members: slice.nodes.map((node) => node.id).filter((id) => id !== key),
    edgeIds: slice.edges.map((edge) => edge.id),
  };
}

function keepEntries<T>(
  record: Record<string, T>,
  keep: (key: string) => boolean,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => keep(key)),
  );
}

export function graphFromSlice(
  slice: GraphSlice,
  project: string,
  positions: Record<NodeId, Point> = {},
): GraphState {
  return {
    generation: 0,
    project,
    focusId: slice.focusId,
    nodes: Object.fromEntries(slice.nodes.map((node) => [node.id, node])),
    edges: Object.fromEntries(slice.edges.map((edge) => [edge.id, edge])),
    slices: { [slice.focusId]: sliceRecord(slice, slice.focusId) },
    positions,
    pinned: [],
    revision: 0,
  };
}

export function isExpanded(graph: GraphState, nodeId: NodeId): boolean {
  return nodeId !== graph.focusId && Object.hasOwn(graph.slices, nodeId);
}

/**
 * Adds the nodes and edges whose ids are absent and records the slice. A node
 * that is already there is never replaced.
 */
export function mergeExpansion(
  graph: GraphState,
  nodeId: NodeId,
  slice: GraphSlice,
): Merged {
  const nodes = { ...graph.nodes };
  const edges = { ...graph.edges };
  const added: NodeId[] = [];
  let edgeAdded = false;
  for (const node of slice.nodes) {
    if (Object.hasOwn(nodes, node.id)) continue;
    nodes[node.id] = node;
    added.push(node.id);
  }
  for (const edge of slice.edges) {
    if (Object.hasOwn(edges, edge.id)) continue;
    edges[edge.id] = edge;
    edgeAdded = true;
  }
  const changed = added.length > 0 || edgeAdded;
  return {
    graph: {
      ...graph,
      nodes,
      edges,
      slices: { ...graph.slices, [nodeId]: sliceRecord(slice, nodeId) },
      revision: changed ? graph.revision + 1 : graph.revision,
    },
    added,
  };
}

/** The nodes reachable from the centre through the recorded slices. */
function reachableFromCentre(
  focusId: NodeId,
  slices: Record<NodeId, SliceRecord>,
): Set<NodeId> {
  const reached = new Set<NodeId>([focusId]);
  const pending = [focusId];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    for (const member of slices[id]?.members ?? []) {
      if (reached.has(member)) continue;
      reached.add(member);
      pending.push(member);
    }
  }
  return reached;
}

/**
 * Forgets the node's slice, then everything no longer reachable from the
 * centre. Pinned nodes stay; an edge stays only while both ends do and a
 * remaining slice lists it.
 */
export function collapseNode(graph: GraphState, nodeId: NodeId): GraphState {
  if (!isExpanded(graph, nodeId)) return graph;
  const withoutNode = keepEntries(graph.slices, (key) => key !== nodeId);
  const reachable = reachableFromCentre(graph.focusId, withoutNode);
  const slices = keepEntries(withoutNode, (key) => reachable.has(key));
  const keptNode = (id: NodeId) =>
    reachable.has(id) || graph.pinned.includes(id);
  const listed = new Set(
    Object.values(slices).flatMap((record) => record.edgeIds),
  );
  const nodes = keepEntries(graph.nodes, keptNode);
  const edges = Object.fromEntries(
    Object.entries(graph.edges).filter(
      ([key, edge]) =>
        listed.has(key) && keptNode(edge.from) && keptNode(edge.to),
    ),
  );
  const removed =
    Object.keys(graph.nodes).length !== Object.keys(nodes).length ||
    Object.keys(graph.edges).length !== Object.keys(edges).length;
  return {
    ...graph,
    nodes,
    edges,
    slices,
    positions: keepEntries(graph.positions, keptNode),
    revision: removed ? graph.revision + 1 : graph.revision,
  };
}

function existing(
  graph: GraphState,
  positions: Record<NodeId, Point>,
): [NodeId, Point][] {
  return Object.entries(positions).filter(([id]) =>
    Object.hasOwn(graph.nodes, id),
  );
}

export function pinNodes(
  graph: GraphState,
  moved: Record<NodeId, Point>,
): GraphState {
  const entries = existing(graph, moved);
  if (entries.length === 0) return graph;
  const fresh = entries
    .map(([id]) => id)
    .filter((id) => !graph.pinned.includes(id));
  return {
    ...graph,
    positions: { ...graph.positions, ...Object.fromEntries(entries) },
    pinned: [...graph.pinned, ...fresh],
    revision: graph.revision + 1,
  };
}

export function unpinNode(graph: GraphState, nodeId: NodeId): GraphState {
  if (!graph.pinned.includes(nodeId)) return graph;
  return {
    ...graph,
    pinned: graph.pinned.filter((id) => id !== nodeId),
    revision: graph.revision + 1,
  };
}

export function setPositions(
  graph: GraphState,
  positions: Record<NodeId, Point>,
): GraphState {
  const entries = existing(graph, positions);
  if (entries.length === 0) return graph;
  return {
    ...graph,
    positions: { ...graph.positions, ...Object.fromEntries(entries) },
    revision: graph.revision + 1,
  };
}
