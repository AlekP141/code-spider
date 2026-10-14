import { describe, expect, it } from "vitest";
import { applyExpansion } from "../../src/view/expansion.js";
import { mergeExpansion, setPositions } from "../../src/view/graph-state.js";
import type { GraphState } from "../../src/view/types.js";
import { calledSlice, graphOf, id } from "../support/graph-states.js";
import { makeEdge, makeNode, makeSlice } from "../support/slices.js";
import { markTests, PITCH, testBox } from "../support/hidden-graphs.js";

const GAP = 192;

function placedGraph(): GraphState {
  return setPositions(graphOf("a", [], ["b"]), {
    [id("a")]: { x: 1000, y: 500 },
    [id("b")]: { x: 1000 + PITCH, y: 500 },
  });
}

describe("applyExpansion while hiding", () => {
  it("gives an added test box no position and stacks the added visible boxes as if it were absent", () => {
    const withTest = markTests(calledSlice("b", ["d", "t", "e"]), "t");
    const hiding = applyExpansion(
      placedGraph(),
      id("b"),
      withTest,
      GAP,
      "hide",
    );
    const without = applyExpansion(
      placedGraph(),
      id("b"),
      calledSlice("b", ["d", "e"]),
      GAP,
    );
    expect(hiding.graph.positions[id("t")]).toBeUndefined();
    expect(hiding.graph.nodes[id("t")]).toBeDefined();
    expect(hiding.graph.positions[id("d")]).toEqual(
      without.graph.positions[id("d")],
    );
    expect(hiding.graph.positions[id("e")]).toEqual(
      without.graph.positions[id("e")],
    );
  });

  it("lists only the boxes that were placed in added", () => {
    const withTest = markTests(calledSlice("b", ["d", "t", "e"]), "t");
    const { added } = applyExpansion(
      placedGraph(),
      id("b"),
      withTest,
      GAP,
      "hide",
    );
    expect(added).toEqual([id("d"), id("e")]);
  });

  it("places a box that was hidden and is now reached from the expanded box beside it", () => {
    const hiddenX = mergeExpansion(
      placedGraph(),
      id("b"),
      makeSlice(
        id("b"),
        [makeNode({ id: id("b") }), testBox("t"), makeNode({ id: id("x") })],
        [makeEdge(id("b"), id("t")), makeEdge(id("x"), id("t"))],
      ),
    ).graph;
    expect(hiddenX.positions[id("x")]).toBeUndefined();
    const reconnect = makeSlice(
      id("b"),
      [makeNode({ id: id("b") }), makeNode({ id: id("x") })],
      [makeEdge(id("x"), id("b"))],
    );
    const { graph, added } = applyExpansion(
      hiddenX,
      id("b"),
      reconnect,
      GAP,
      "hide",
    );
    expect(added).toEqual([id("x")]);
    expect(graph.positions[id("x")]?.x).toBe(1000);
    expect(graph.positions[id("t")]).toBeUndefined();
  });

  it("leaves a box still reached only through a test box without a position", () => {
    const hiddenX = mergeExpansion(
      placedGraph(),
      id("b"),
      makeSlice(
        id("b"),
        [makeNode({ id: id("b") }), testBox("t"), makeNode({ id: id("x") })],
        [makeEdge(id("b"), id("t")), makeEdge(id("x"), id("t"))],
      ),
    ).graph;
    const addsW = makeSlice(
      id("b"),
      [makeNode({ id: id("b") }), makeNode({ id: id("w") })],
      [makeEdge(id("w"), id("b"))],
    );
    const { graph, added } = applyExpansion(
      hiddenX,
      id("b"),
      addsW,
      GAP,
      "hide",
    );
    expect(added).toEqual([id("w")]);
    expect(graph.positions[id("x")]).toBeUndefined();
    expect(graph.positions[id("w")]).toBeDefined();
  });
});

describe("applyExpansion while showing", () => {
  it("places every added box as before", () => {
    const withTest = markTests(calledSlice("b", ["d", "t", "e"]), "t");
    const { graph, added } = applyExpansion(
      placedGraph(),
      id("b"),
      withTest,
      GAP,
    );
    expect(added).toEqual([id("d"), id("t"), id("e")]);
    for (const name of ["d", "t", "e"]) {
      expect(graph.positions[id(name)]).toBeDefined();
    }
  });
});
