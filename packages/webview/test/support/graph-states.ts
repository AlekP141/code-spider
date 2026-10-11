import type { GraphNode, GraphSlice } from "@code-spider/core/types";
import { graphFromSlice } from "../../src/view/graph-state.js";
import type { RefreshAnswer } from "../../src/view/refresh.js";
import type { GraphState, Point } from "../../src/view/types.js";
import { makeEdge, makeNode, makeSlice, site } from "./slices.js";

export const PROJECT = "/repo/tsconfig.json";

export const id = (name: string): string => `src/a.ts#${name}`;

export function sliceOf(
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
): GraphSlice {
  const names = [focus, ...suppliers, ...consumers];
  return makeSlice(
    id(focus),
    names.map((name) => makeNode({ id: id(name) })),
    [
      ...suppliers.map((name) => makeEdge(id(name), id(focus))),
      ...consumers.map((name) => makeEdge(id(focus), id(name))),
    ],
  );
}

export function calledSlice(
  focus: string,
  called: string[],
  consumers: string[] = [],
): GraphSlice {
  const names = [focus, ...called, ...consumers];
  return makeSlice(
    id(focus),
    names.map((name) => makeNode({ id: id(name) })),
    [
      ...called.map((name, i) =>
        makeEdge(id(name), id(focus), { callSite: site(i + 2) }),
      ),
      ...consumers.map((name) => makeEdge(id(focus), id(name))),
    ],
  );
}

export function graphOf(
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
): GraphState {
  return graphFromSlice(sliceOf(focus, suppliers, consumers), PROJECT);
}

export function nodeIds(graph: GraphState): string[] {
  return Object.keys(graph.nodes).sort();
}

export function edgeIds(graph: GraphState): string[] {
  return Object.keys(graph.edges).sort();
}

export function withPositions(
  graph: GraphState,
  positions: Record<string, Point>,
): GraphState {
  return { ...graph, positions };
}

export function tweakNode(
  slice: GraphSlice,
  name: string,
  patch: Partial<GraphNode>,
): GraphSlice {
  return {
    ...slice,
    nodes: slice.nodes.map((node) =>
      node.id === id(name) ? { ...node, ...patch } : node,
    ),
  };
}

export function answerOf(
  current: GraphState,
  centre: GraphSlice,
  expansions: RefreshAnswer["expansions"] = [],
  sourceVersion = 1,
): RefreshAnswer {
  return {
    type: "refreshed",
    project: current.project,
    generation: current.generation,
    sourceVersion,
    centre,
    expansions,
  };
}
