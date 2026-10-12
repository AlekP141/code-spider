import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { NODE_WIDTH } from "../graph/constants.js";
import { nodeHeight } from "../graph/node-size.js";
import { placeExpansion, type Rect } from "../graph/placement.js";
import type { SliceMode } from "../host/protocol.js";
import { mergeExpansion, setPositions, type Merged } from "./graph-state.js";
import type { GraphState, ViewState } from "./types.js";
import { replaceCurrent } from "./view-state.js";

export type ExpansionAnswer = {
  slice: GraphSlice;
  project: string;
  mode: Extract<SliceMode, { kind: "expansion" }>;
};

export type Accepted = { view: ViewState; added: NodeId[] };

export function rectsOf(graph: GraphState): Rect[] {
  return Object.entries(graph.positions).flatMap(([nodeId, at]) => {
    const node = graph.nodes[nodeId];
    return node ? [{ ...at, width: NODE_WIDTH, height: nodeHeight(node) }] : [];
  });
}

/**
 * Merges the slice, then places the nodes it added around `nodeId`. Nodes that
 * were already there keep their positions, dragged or not. A node without a
 * position anchors at the origin.
 */
export function applyExpansion(
  graph: GraphState,
  nodeId: NodeId,
  slice: GraphSlice,
  columnGap: number,
): Merged {
  const merged = mergeExpansion(graph, nodeId, slice);
  const anchorNode = graph.nodes[nodeId];
  if (!anchorNode || merged.added.length === 0) return merged;
  const anchor: Rect = {
    ...(graph.positions[nodeId] ?? { x: 0, y: 0 }),
    width: NODE_WIDTH,
    height: nodeHeight(anchorNode),
  };
  const placed = placeExpansion({
    expandedId: nodeId,
    anchor,
    added: merged.added.flatMap((id) => {
      const node = merged.graph.nodes[id];
      return node ? [{ id, height: nodeHeight(node) }] : [];
    }),
    edges: slice.edges,
    existing: rectsOf(graph),
    columnGap,
  });
  return { graph: setPositions(merged.graph, placed), added: merged.added };
}

/**
 * Applies an expansion answer only if it still belongs to the graph on screen.
 * Otherwise the very same view comes back.
 */
export function acceptExpansion(
  view: ViewState,
  answer: ExpansionAnswer,
  columnGap: number,
): Accepted {
  const { slice, project, mode } = answer;
  const current = view.current;
  const belongs =
    current !== undefined &&
    mode.generation === current.generation &&
    project === current.project &&
    Object.hasOwn(current.nodes, mode.nodeId) &&
    mode.nodeId !== current.focusId &&
    slice.focusId === mode.nodeId;
  if (!belongs) return { view, added: [] };
  const { graph, added } = applyExpansion(
    current,
    mode.nodeId,
    slice,
    columnGap,
  );
  return { view: replaceCurrent(view, graph), added };
}
