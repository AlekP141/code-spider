import { describe, expect, it } from "vitest";
import { pinNodes } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { GraphState } from "../../src/view/types.js";
import {
  answerOf,
  graphOf,
  id,
  openAll,
  withPositions,
} from "../support/graph-states.js";
import { makeEdge, makeNode, makeSlice } from "../support/slices.js";
import { PITCH, testBox } from "../support/hidden-graphs.js";

const GAP = 192;

function current(): GraphState {
  return withPositions(graphOf("a", [], ["b"]), {
    [id("a")]: { x: 0, y: 0 },
    [id("b")]: { x: PITCH, y: 0 },
  });
}

const plain = (name: string) => makeNode({ id: id(name) });

const withNewTest = () =>
  makeSlice(
    id("a"),
    [plain("a"), plain("b"), plain("n"), testBox("t")],
    [
      makeEdge(id("a"), id("b")),
      makeEdge(id("a"), id("n")),
      makeEdge(id("a"), id("t")),
    ],
  );

const strandsB = () =>
  makeSlice(
    id("a"),
    [plain("a"), testBox("t"), plain("b")],
    [makeEdge(id("a"), id("t")), makeEdge(id("b"), id("t"))],
  );

const reconnectsB = () =>
  makeSlice(
    id("a"),
    [plain("a"), testBox("t"), plain("b")],
    [makeEdge(id("a"), id("t")), makeEdge(id("a"), id("b"))],
  );

describe("rebuildGraph while hiding", () => {
  it("leaves a new test box without a position and moves no visible box", () => {
    const before = current();
    const { graph } = rebuildGraph(
      before,
      answerOf(before, withNewTest()),
      GAP,
      "hide",
    );
    expect(graph.nodes[id("t")]).toBeDefined();
    expect(graph.positions[id("t")]).toBeUndefined();
    expect(graph.positions[id("a")]).toEqual(before.positions[id("a")]);
    expect(graph.positions[id("b")]).toEqual(before.positions[id("b")]);
    expect(graph.positions[id("n")]).toBeDefined();
  });

  it("drops the position, pin and open entry of a box the new code strands", () => {
    const before = pinNodes(openAll(current()), {
      [id("b")]: { x: PITCH, y: 0 },
    });
    expect(before.open).toContain(id("b"));
    const { graph } = rebuildGraph(
      before,
      answerOf(before, strandsB()),
      GAP,
      "hide",
    );
    expect(graph.nodes[id("b")]).toBeDefined();
    expect(graph.positions[id("b")]).toBeUndefined();
    expect(graph.pinned).not.toContain(id("b"));
    expect(graph.open).not.toContain(id("b"));
    expect(graph.positions[id("a")]).toEqual({ x: 0, y: 0 });
  });

  it("places a box the new code reconnects, like any fresh box", () => {
    const before = current();
    const stranded = rebuildGraph(
      before,
      answerOf(before, strandsB()),
      GAP,
      "hide",
    ).graph;
    const { graph, added } = rebuildGraph(
      stranded,
      answerOf(stranded, reconnectsB()),
      GAP,
      "hide",
    );
    expect(added).toEqual([id("b")]);
    expect(graph.positions[id("b")]?.x).toBe(PITCH);
    expect(graph.pinned).not.toContain(id("b"));
  });

  it("returns only placed boxes in added", () => {
    const before = current();
    const { added } = rebuildGraph(
      before,
      answerOf(before, withNewTest()),
      GAP,
      "hide",
    );
    expect(added).toEqual([id("n")]);
  });
});

describe("rebuildGraph while showing", () => {
  it("places a new test box as before", () => {
    const before = current();
    const { graph, added } = rebuildGraph(
      before,
      answerOf(before, withNewTest()),
      GAP,
    );
    expect(graph.positions[id("t")]).toBeDefined();
    expect(added).toContain(id("t"));
  });
});
