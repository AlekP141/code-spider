import type { GraphSlice, NodeId } from "@code-spider/core/types";
import { NODE_WIDTH } from "../graph/constants.js";
import {
  DEFAULT_TEST_VISIBILITY,
  type TestVisibility,
} from "../settings/test-visibility.js";
import { nodeHeight } from "../graph/nodes/node-size.js";
import { placeExpansion, type Rect } from "../graph/layout/placement.js";
import type { SliceMode } from "../host/protocol.js";
import {
  isOpen,
  mergeExpansion,
  setPositions,
  type Merged,
} from "./graph-state.js";
import { hiddenIds } from "./test-visibility.js";
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
    if (!node) return [];
    const height = nodeHeight(node, isOpen(graph, nodeId));
    return [{ ...at, width: NODE_WIDTH, height }];
  });
}

/**
 * Merges the slice, then places around `nodeId` the nodes it added and, while
 * hiding, the ones it made visible. A hidden node gets no position. Nodes that
 * were already placed keep their positions, dragged or not. A node without a
 * position anchors at the origin.
 */
export function applyExpansion(
  graph: GraphState,
  nodeId: NodeId,
  slice: GraphSlice,
  columnGap: number,
  visibility: TestVisibility = DEFAULT_TEST_VISIBILITY,
): Merged {
  const merged = mergeExpansion(graph, nodeId, slice);
  const anchorNode = graph.nodes[nodeId];
  if (!anchorNode) return merged;
  const hiddenBefore = hiddenIds(graph, visibility);
  const hiddenAfter = hiddenIds(merged.graph, visibility);
  const revealed = [...hiddenBefore].filter((id) => !hiddenAfter.has(id));
  const toPlace = [...merged.added, ...revealed].filter(
    (id) => !hiddenAfter.has(id),
  );
  if (toPlace.length === 0) return { graph: merged.graph, added: [] };
  const anchor: Rect = {
    ...(graph.positions[nodeId] ?? { x: 0, y: 0 }),
    width: NODE_WIDTH,
    height: nodeHeight(anchorNode, isOpen(graph, nodeId)),
  };
  const placed = placeExpansion({
    expandedId: nodeId,
    anchor,
    added: toPlace.flatMap((id) => {
      const node = merged.graph.nodes[id];
      return node
        ? [{ id, height: nodeHeight(node, isOpen(merged.graph, id)) }]
        : [];
    }),
    edges: slice.edges,
    existing: rectsOf(graph),
    columnGap,
  });
  return { graph: setPositions(merged.graph, placed), added: toPlace };
}

/**
 * Applies an expansion answer only if it still belongs to the graph on screen.
 * Otherwise the very same view comes back.
 */
export function acceptExpansion(
  view: ViewState,
  answer: ExpansionAnswer,
  columnGap: number,
  visibility: TestVisibility = DEFAULT_TEST_VISIBILITY,
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
    visibility,
  );
  return { view: replaceCurrent(view, graph), added };
}
