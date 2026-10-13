import type { GraphSlice } from "@code-spider/core/types";
import { rowGap } from "../../src/settings/column-gap.js";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { graphFromSlice, mergeExpansion } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { GraphState, Point } from "../../src/view/types.js";
import { CLOSED_HEIGHT, OPEN_HEIGHT } from "./geometry.js";
import {
  answerOf,
  id,
  openAll,
  PROJECT,
  withPositions,
} from "./graph-states.js";

export const GAP = 192;
export const MARGIN = rowGap(GAP);
export const PITCH = NODE_WIDTH + GAP;
export const HEIGHT = OPEN_HEIGHT;
export const ROW = HEIGHT + MARGIN;
export const CLOSED_ROW = CLOSED_HEIGHT + MARGIN;
export const A: Point = { x: 1000, y: 0 };
export const COLUMN = A.x - PITCH;

export const inColumn = (y: number): Point => ({ x: COLUMN, y });

export function graphAt(
  slice: GraphSlice,
  spots: Record<string, Point>,
  pinned: string[] = [],
  expansions: GraphSlice[] = [],
): GraphState {
  let graph = graphFromSlice(slice, PROJECT);
  for (const expansion of expansions) {
    graph = mergeExpansion(graph, expansion.focusId, expansion).graph;
  }
  const positions = Object.fromEntries(
    Object.entries(spots).map(([name, at]) => [id(name), at]),
  );
  return openAll({
    ...withPositions(graph, positions),
    pinned: pinned.map(id),
  });
}

export function refresh(
  current: GraphState,
  centre: GraphSlice,
  expansions: GraphSlice[] = [],
  gap = GAP,
) {
  const answer = answerOf(
    current,
    centre,
    expansions.map((slice) => ({ nodeId: slice.focusId, slice })),
  );
  return rebuildGraph(current, answer, gap);
}

export const at = (graph: GraphState, name: string) =>
  graph.positions[id(name)];
