import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import { id, sliceOf } from "../support/graph-states.js";
import { pathMessage } from "../support/path-graphs.js";
import {
  partsOf,
  pathAnswer,
  PITCH,
  placed,
} from "../support/path-refresh.js";
import { makeEdge, makeNode } from "../support/slices.js";

function refreshing(): AppState {
  const pending = reduceApp(createAppState(undefined), pathMessage());
  const graph = pending.pending?.graph;
  if (!graph) throw new Error("nothing is pending");
  const laidOut = reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions: placed(graph).positions,
  });
  return reduceApp(laidOut, { type: "refreshStarted" });
}

function graphOf(state: AppState) {
  const graph = state.view.current;
  if (!graph) throw new Error("no graph");
  return graph;
}

function longerRoute() {
  const route = {
    nodes: ["a", "m", "n", "z"].map((name) => makeNode({ id: id(name) })),
    edges: [
      makeEdge(id("a"), id("m")),
      makeEdge(id("m"), id("n")),
      makeEdge(id("n"), id("z")),
    ],
  };
  return partsOf(sliceOf("a", ["s"], ["m"]), route);
}

describe("a refresh answer for a path graph", () => {
  it("is ignored when it is for another end", () => {
    const state = refreshing();
    const parts = longerRoute();
    const answer = pathAnswer(graphOf(state), {
      ...parts,
      path: { ...parts.path, endId: id("y") },
    });
    expect(reduceApp(state, answer)).toBe(state);
  });

  it("rebuilds the path graph and replaces path when generation, project, centre and end match", () => {
    const state = refreshing();
    const before = graphOf(state);
    const parts = longerRoute();
    const next = reduceApp(state, pathAnswer(before, parts, [], 8));
    const graph = graphOf(next);
    expect(graph.path).toEqual(parts.path);
    expect(Object.hasOwn(graph.nodes, id("n"))).toBe(true);
    expect(graph.positions[id("n")]?.x).toBe(PITCH);
    expect(graph.positions[id("a")]).toEqual(before.positions[id("a")]);
    expect(graph.sourceVersion).toBe(8);
    expect(next.refreshing).toBe(false);
  });

  it("is ignored when it carries no path", () => {
    const state = refreshing();
    const { route: _route, path: _path, ...plain } = pathAnswer(
      graphOf(state),
      longerRoute(),
    );
    expect(reduceApp(state, plain)).toBe(state);
  });
});
