import type { PathInfo, PathRoute } from "@code-spider/core/types";
import type { PathFoundMessage } from "../../src/host/protocol.js";
import { graphFromPath } from "../../src/view/path-graph.js";
import type { GraphState } from "../../src/view/types.js";
import { id, PROJECT, sliceOf, tweakNode } from "./graph-states.js";
import { makeEdge, makeNode } from "./slices.js";

export type PathParts = Pick<PathFoundMessage, "slice" | "route" | "path">;

export function summary(): PathInfo["summary"] {
  return { routes: 1, routesCapped: false, leftOut: 0, checked: 3 };
}

export function pathInfo(
  boxes: string[],
  edgeIds: string[],
  end = "z",
): PathInfo {
  return {
    endId: id(end),
    boxes: boxes.map((name, column) => ({ id: id(name), column })),
    edgeIds,
    summary: summary(),
  };
}

export function routeOf(
  names: string[],
  nodeOverrides: Record<string, Partial<ReturnType<typeof makeNode>>> = {},
): PathRoute {
  return {
    nodes: names.map((name) =>
      makeNode({ id: id(name), ...nodeOverrides[name] }),
    ),
    edges: names
      .slice(1)
      .map((name, i) => makeEdge(id(names[i] ?? name), id(name))),
  };
}

/** A is a, B is z; a route a, m, z; a's own neighbours are s and m. */
export function pathParts(): PathParts {
  const route = routeOf(["a", "m", "z"], { m: { name: "route m" } });
  return {
    slice: tweakNode(sliceOf("a", ["s"], ["m"]), "m", { name: "slice m" }),
    route,
    path: pathInfo(
      ["a", "m", "z"],
      route.edges.map((edge) => edge.id),
    ),
  };
}

export function pathGraph(parts: PathParts = pathParts()): GraphState {
  return graphFromPath(parts, PROJECT);
}

export function pathMessage(parts: PathParts = pathParts()): PathFoundMessage {
  return {
    type: "pathFound",
    project: PROJECT,
    ...parts,
    sourceVersion: 4,
  };
}
