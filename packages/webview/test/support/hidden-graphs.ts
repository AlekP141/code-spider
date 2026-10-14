import type { GraphEdge, GraphSlice } from "@code-spider/core/types";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import type { GraphState, Point } from "../../src/view/types.js";
import {
  calledSlice,
  id,
  PROJECT,
  tweakNode,
} from "./graph-states.js";
import { makeEdge, makeNode, makeSlice } from "./slices.js";

export const PITCH = 320 + 192;

export function testBox(name: string) {
  return makeNode({ id: id(name), isTest: true, file: "src/a.test.ts" });
}

/** A centre graph: `plain` and `tests` boxes joined by `links` (from, to). */
export function linkedGraph(input: {
  focus: string;
  plain?: string[];
  tests?: string[];
  links: [string, string][];
  positions?: Record<string, Point>;
}): GraphState {
  const edges: GraphEdge[] = input.links.map(([from, to], index) =>
    makeEdge(id(from), id(to), { id: `e${index}` }),
  );
  const nodes = [
    makeNode({ id: id(input.focus) }),
    ...(input.plain ?? []).map((name) => makeNode({ id: id(name) })),
    ...(input.tests ?? []).map(testBox),
  ];
  return graphFromSlice(
    makeSlice(id(input.focus), nodes, edges),
    PROJECT,
    input.positions,
  );
}

export function markTests(slice: GraphSlice, ...names: string[]): GraphSlice {
  return names.reduce(
    (marked, name) => tweakNode(marked, name, { isTest: true }),
    slice,
  );
}

export function centreOf(
  start: AppState,
  slice: GraphSlice,
  positions: Record<string, Point>,
): AppState {
  const pending = reduceApp(start, {
    type: "slice",
    slice,
    project: PROJECT,
    mode: { kind: "centre", sourceVersion: 0 },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions,
  });
}

export function expandedWith(
  state: AppState,
  nodeId: string,
  slice: GraphSlice,
): AppState {
  return reduceApp(state, {
    type: "slice",
    slice,
    project: PROJECT,
    mode: {
      kind: "expansion",
      nodeId,
      generation: state.view.current?.generation ?? -1,
    },
  });
}

/**
 * Centre a with b (called by a) and test box t (a calls it); t is expanded to
 * u, which only t leads to. Everything is shown and placed.
 */
export function scenario(): AppState {
  const centre = markTests(calledSlice("a", ["b"], ["t"]), "t");
  const shown = centreOf(createAppState(undefined), centre, {
    [id("a")]: { x: 1000, y: 500 },
    [id("b")]: { x: 1000 - PITCH, y: 500 },
    [id("t")]: { x: 1000 + PITCH, y: 500 },
  });
  const tSlice = makeSlice(
    id("t"),
    [testBox("t"), makeNode({ id: id("u") })],
    [makeEdge(id("t"), id("u"))],
  );
  return expandedWith(shown, id("t"), tSlice);
}

export function current(state: AppState): GraphState {
  const graph = state.view.current;
  if (!graph) throw new Error("no graph");
  return graph;
}
