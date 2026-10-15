import type { NodeId } from "@code-spider/core/types";
import { rowGap } from "../../settings/column-gap.js";
import { isOpen } from "../../view/graph-state.js";
import { placeUnpositioned } from "../../view/place-unpositioned.js";
import type { GraphState, Point } from "../../view/types.js";
import { NODE_WIDTH } from "../constants.js";
import { nodeHeight } from "../nodes/node-size.js";
import { layoutGraph, type Positions } from "./layout.js";
import { stackTops } from "./placement.js";

type Drawn = { id: NodeId; height: number };

function routePositions(
  graph: GraphState,
  columnGap: number,
): Record<NodeId, Point> {
  const columns = new Map<number, Drawn[]>();
  for (const box of graph.path?.boxes ?? []) {
    const node = graph.nodes[box.id];
    if (!node) continue;
    const height = nodeHeight(node, isOpen(graph, box.id));
    const drawn = { id: box.id, height };
    columns.set(box.column, [...(columns.get(box.column) ?? []), drawn]);
  }
  const positions: Record<NodeId, Point> = {};
  for (const [column, boxes] of columns) {
    const heights = boxes.map((box) => box.height);
    const tops = stackTops(0, heights, rowGap(columnGap));
    for (const [index, box] of boxes.entries()) {
      positions[box.id] = {
        x: column * (NODE_WIDTH + columnGap),
        y: tops[index] ?? 0,
      };
    }
  }
  return positions;
}

/**
 * Route boxes sit in their columns, stacked and centred on y = 0, and never
 * move afterwards. Every other box is placed the way an expansion's boxes are.
 */
export function pathPositions(
  graph: GraphState,
  columnGap: number,
): Record<NodeId, Point> {
  const route = routePositions(graph, columnGap);
  return placeUnpositioned({ ...graph, positions: route }, columnGap).positions;
}

export function layoutFor(
  graph: GraphState,
  columnGap: number,
  elk: typeof layoutGraph = layoutGraph,
): Promise<Positions> {
  return graph.path
    ? Promise.resolve(pathPositions(graph, columnGap))
    : elk(graph, columnGap);
}
