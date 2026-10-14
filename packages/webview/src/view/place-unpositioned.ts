import type { NodeId } from "@code-spider/core/types";
import type { CallEdge } from "../graph/layout/call-order.js";
import { NODE_WIDTH } from "../graph/constants.js";
import { nodeHeight } from "../graph/nodes/node-size.js";
import { placeExpansion, type Rect } from "../graph/layout/placement.js";
import { rectsOf } from "./expansion.js";
import { isOpen, setPositions } from "./graph-state.js";
import type { GraphState, Point } from "./types.js";

type Group = { key: NodeId; ids: NodeId[]; edges: CallEdge[] };

function groupsOf(graph: GraphState, positionless: Set<NodeId>): Group[] {
  const claimed = new Set<NodeId>();
  const groups: Group[] = [];
  for (const [key, record] of Object.entries(graph.slices)) {
    const ids = record.members.filter(
      (id) => positionless.has(id) && !claimed.has(id),
    );
    if (ids.length === 0) continue;
    for (const id of ids) claimed.add(id);
    const edges = record.edgeIds.flatMap((edgeId) => {
      const edge = graph.edges[edgeId];
      return edge ? [edge] : [];
    });
    groups.push({ key, ids, edges });
  }
  const strays = [...positionless].filter((id) => !claimed.has(id));
  if (strays.length > 0) {
    groups.push({
      key: graph.focusId,
      ids: strays,
      edges: Object.values(graph.edges),
    });
  }
  return groups;
}

/**
 * Places every box without a position the way an expansion would place new
 * boxes, group by group in slice order. A box that has a position never moves.
 */
export function placeUnpositioned(
  graph: GraphState,
  columnGap: number,
): GraphState {
  const positionless = new Set(
    Object.keys(graph.nodes).filter(
      (id) => !Object.hasOwn(graph.positions, id),
    ),
  );
  if (positionless.size === 0) return graph;
  let positions: Record<NodeId, Point> = graph.positions;
  const placed: Record<NodeId, Point> = {};
  for (const { key, ids, edges } of groupsOf(graph, positionless)) {
    const anchorNode = graph.nodes[key];
    if (!anchorNode) continue;
    const anchor: Rect = {
      ...(positions[key] ?? { x: 0, y: 0 }),
      width: NODE_WIDTH,
      height: nodeHeight(anchorNode, isOpen(graph, key)),
    };
    const group = placeExpansion({
      expandedId: key,
      anchor,
      added: ids.flatMap((id) => {
        const node = graph.nodes[id];
        if (!node) return [];
        return [{ id, height: nodeHeight(node, isOpen(graph, id)) }];
      }),
      edges,
      existing: rectsOf({ ...graph, positions }),
      columnGap,
    });
    positions = { ...positions, ...group };
    Object.assign(placed, group);
  }
  return setPositions(graph, placed);
}
