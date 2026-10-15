import type {
  GraphSlice,
  NodeId,
  PathRoute,
} from "@code-spider/core/types";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import type { RefreshAnswer } from "../../src/view/refresh.js";
import type { GraphState, Point } from "../../src/view/types.js";
import { id, withPositions } from "./graph-states.js";
import {
  pathGraph,
  pathInfo,
  pathParts,
  type PathParts,
} from "./path-graphs.js";

export const GAP = 192;
export const PITCH = NODE_WIDTH + GAP;

/** The route boxes in order, as columns, with the route's own links. */
export function partsOf(slice: GraphSlice, route: PathRoute): PathParts {
  const names = route.nodes.map((node) => node.id.split("#")[1] ?? node.id);
  return {
    slice,
    route,
    path: {
      ...pathInfo(
        names,
        route.edges.map((edge) => edge.id),
      ),
      boxes: route.nodes.map((node, column) => ({ id: node.id, column })),
    },
  };
}

/** a, s, m and z of `pathParts()` in a row, a at the origin. */
export function placed(
  graph: GraphState,
  extra: Record<string, Point> = {},
  pitch = PITCH,
): GraphState {
  const at: Record<string, Point> = {
    s: { x: -pitch, y: 0 },
    a: { x: 0, y: 0 },
    m: { x: pitch, y: 0 },
    z: { x: 2 * pitch, y: 0 },
    ...extra,
  };
  return withPositions(
    graph,
    Object.fromEntries(
      Object.entries(at)
        .filter(([name]) => Object.hasOwn(graph.nodes, id(name)))
        .map(([name, point]) => [id(name), point]),
    ),
  );
}

export function placedPath(parts: PathParts = pathParts()): GraphState {
  return placed(pathGraph(parts));
}

export function pathAnswer(
  current: GraphState,
  parts: PathParts,
  expansions: RefreshAnswer["expansions"] = [],
  sourceVersion = 9,
): RefreshAnswer {
  return {
    type: "refreshed",
    project: current.project,
    generation: current.generation,
    sourceVersion,
    centre: parts.slice,
    expansions,
    route: parts.route,
    path: parts.path,
  };
}

export const ids = (...names: string[]): NodeId[] => names.map(id);
