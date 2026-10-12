import type { GraphSlice } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { mergeExpansion, pinNodes } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { GraphState } from "../../src/view/types.js";
import {
  answerOf,
  graphOf,
  id,
  nodeIds,
  sliceOf,
  tweakNode,
  withPositions,
} from "../support/graph-states.js";

const GAP = 192;
const PITCH = 320 + GAP;

function staleNodes(graph: GraphState): GraphState {
  return {
    ...graph,
    nodes: Object.fromEntries(
      Object.entries(graph.nodes).map(([key, node]) => [
        key,
        { ...node, returnType: "stale" },
      ]),
    ),
  };
}

function fresh(slice: GraphSlice): GraphSlice {
  return {
    ...slice,
    nodes: slice.nodes.map((node) => ({ ...node, returnType: "fresh" })),
    edges: slice.edges.map((edge) => ({ ...edge, resolved: false })),
  };
}

function chain(): GraphState {
  const base = graphOf("a", [], ["b"]);
  const withB = mergeExpansion(base, id("b"), sliceOf("b", [], ["c"])).graph;
  const full = mergeExpansion(withB, id("c"), sliceOf("c", [], ["d"])).graph;
  return withPositions(full, {
    [id("a")]: { x: 0, y: 0 },
    [id("b")]: { x: PITCH, y: 0 },
    [id("c")]: { x: 2 * PITCH, y: 0 },
    [id("d")]: { x: 3 * PITCH, y: 0 },
  });
}

describe("rebuildGraph replaces what it rebuilds", () => {
  it("replaces node data and edges with the fresh ones", () => {
    const current = chain();
    const answer = answerOf(current, fresh(sliceOf("a", [], ["b"])), [
      { nodeId: id("b"), slice: fresh(sliceOf("b", [], ["c"])) },
      { nodeId: id("c"), slice: fresh(sliceOf("c", [], ["d"])) },
    ]);
    const { graph } = rebuildGraph(staleNodes(current), answer, GAP);
    expect(nodeIds(graph)).toEqual([id("a"), id("b"), id("c"), id("d")]);
    for (const node of Object.values(graph.nodes)) {
      expect(node.returnType).toBe("fresh");
    }
    expect(Object.keys(graph.edges)).toHaveLength(3);
    for (const edge of Object.values(graph.edges)) {
      expect(edge.resolved).toBe(false);
    }
  });

  it("lets a slice applied later replace a node and an edge an earlier one brought", () => {
    const base = graphOf("a", [], ["b"]);
    const current = withPositions(
      mergeExpansion(base, id("b"), sliceOf("b", ["a"])).graph,
      {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: PITCH, y: 0 },
      },
    );
    const bSlice = fresh(sliceOf("b", ["a"]));
    const { graph } = rebuildGraph(
      current,
      answerOf(current, sliceOf("a", [], ["b"]), [
        { nodeId: id("b"), slice: bSlice },
      ]),
      GAP,
    );
    expect(graph.nodes[id("a")]?.returnType).toBe("fresh");
    expect(graph.nodes[id("b")]?.returnType).toBe("fresh");
    expect(graph.edges[`${id("a")}->${id("b")}`]?.resolved).toBe(false);
  });

  it("records the members and edge ids of the fresh slices", () => {
    const current = chain();
    const centre = sliceOf("a", [], ["b"]);
    const bSlice = sliceOf("b", ["e"], ["c"]);
    const { graph } = rebuildGraph(
      current,
      answerOf(current, centre, [{ nodeId: id("b"), slice: bSlice }]),
      GAP,
    );
    expect(graph.slices[id("b")]).toEqual({
      members: [id("e"), id("c")],
      edgeIds: [`${id("e")}->${id("b")}`, `${id("b")}->${id("c")}`],
    });
    expect(graph.slices[id("a")]).toEqual({
      members: [id("b")],
      edgeIds: [`${id("a")}->${id("b")}`],
    });
  });
});

describe("rebuildGraph keeps what the user built", () => {
  it("keeps position and pin of a node that stays, and drops one that left", () => {
    const base = graphOf("a", ["b"], ["c"]);
    const current = pinNodes(
      withPositions(base, {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: -PITCH, y: 10 },
        [id("c")]: { x: PITCH, y: 20 },
      }),
      { [id("b")]: { x: -PITCH - 7, y: 300 } },
    );
    const centre = tweakNode(sliceOf("a", ["b"]), "b", { returnType: "x" });
    const answer = answerOf(current, centre);
    const { graph, added } = rebuildGraph(current, answer, GAP);
    expect(graph.positions).toEqual({
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: -PITCH - 7, y: 300 },
    });
    expect(graph.pinned).toEqual([id("b")]);
    expect(graph.nodes[id("c")]).toBeUndefined();
    expect(added).toEqual([]);
  });

  it("drops a vanished expanded box with everything reachable only through it", () => {
    const current = chain();
    const answer = answerOf(current, sliceOf("a"), [
      { nodeId: id("b"), slice: sliceOf("b", [], ["c"]) },
      { nodeId: id("c"), slice: sliceOf("c", [], ["d"]) },
    ]);
    const { graph } = rebuildGraph(current, answer, GAP);
    expect(nodeIds(graph)).toEqual([id("a")]);
    expect(Object.keys(graph.slices)).toEqual([id("a")]);
    expect(Object.keys(graph.positions)).toEqual([id("a")]);
  });

  it("applies an expansion reachable only through another in a later pass, whatever the answer order", () => {
    const current = chain();
    const slices = [
      { nodeId: id("b"), slice: sliceOf("b", [], ["c"]) },
      { nodeId: id("c"), slice: sliceOf("c", [], ["d"]) },
    ];
    const centre = sliceOf("a", [], ["b"]);
    const forward = rebuildGraph(
      current,
      answerOf(current, centre, slices),
      GAP,
    );
    const backward = rebuildGraph(
      current,
      answerOf(current, centre, [...slices].reverse()),
      GAP,
    );
    expect(nodeIds(forward.graph)).toEqual(["a", "b", "c", "d"].map(id));
    expect(Object.keys(forward.graph.slices)).toEqual(
      ["a", "b", "c"].map(id),
    );
    expect(backward).toEqual(forward);
  });

  it("gives a new node two slices both list to the slice that applies first, in any answer order", () => {
    const base = graphOf("a", [], ["b", "c"]);
    const withB = mergeExpansion(base, id("b"), sliceOf("b", [], ["y"])).graph;
    const current = withPositions(
      mergeExpansion(withB, id("c"), sliceOf("c", [], ["z"])).graph,
      {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: PITCH, y: 0 },
        [id("c")]: { x: PITCH, y: 400 },
        [id("y")]: { x: 2 * PITCH, y: 0 },
        [id("z")]: { x: 2 * PITCH, y: 400 },
      },
    );
    const slices = [
      { nodeId: id("b"), slice: sliceOf("b", [], ["x"]) },
      { nodeId: id("c"), slice: sliceOf("c", [], ["x"]) },
    ];
    const centre = sliceOf("a", [], ["b", "c"]);
    const forward = rebuildGraph(
      current,
      answerOf(current, centre, slices),
      GAP,
    );
    const backward = rebuildGraph(
      current,
      answerOf(current, centre, [...slices].reverse()),
      GAP,
    );
    expect(backward).toEqual(forward);
    expect(forward.added).toEqual([id("x")]);
    expect(forward.graph.positions[id("x")]?.x).toBe(2 * PITCH);
    expect(forward.graph.positions[id("x")]?.y).toBeLessThan(200);
  });

  it("ignores an expansion the user collapsed meanwhile or whose focusId differs", () => {
    const base = graphOf("a", [], ["b", "c", "e"]);
    const withB = mergeExpansion(base, id("b"), sliceOf("b", [], ["d"])).graph;
    const current = withPositions(
      mergeExpansion(withB, id("e"), sliceOf("e", [], ["h"])).graph,
      {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: PITCH, y: 0 },
        [id("c")]: { x: PITCH, y: 200 },
        [id("e")]: { x: PITCH, y: 400 },
        [id("d")]: { x: 2 * PITCH, y: 0 },
        [id("h")]: { x: 2 * PITCH, y: 400 },
      },
    );
    const answer = answerOf(current, sliceOf("a", [], ["b", "c", "e"]), [
      { nodeId: id("b"), slice: sliceOf("b", [], ["d"]) },
      { nodeId: id("c"), slice: sliceOf("c", [], ["f"]) },
      { nodeId: id("e"), slice: sliceOf("c", [], ["g"]) },
    ]);
    const { graph } = rebuildGraph(current, answer, GAP);
    expect(Object.keys(graph.slices).sort()).toEqual([id("a"), id("b")]);
    for (const absent of ["f", "g", "h"]) {
      expect(graph.nodes[id(absent)]).toBeUndefined();
    }
    expect(graph.nodes[id("d")]).toBeDefined();
  });

  it("removes a pinned box the rebuilt graph no longer reaches, and keeps a reached one", () => {
    const base = graphOf("a", [], ["b", "c"]);
    const expanded = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", [], ["d"]),
    ).graph;
    const placed = withPositions(expanded, {
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: PITCH, y: 0 },
      [id("c")]: { x: PITCH, y: 200 },
      [id("d")]: { x: 2 * PITCH, y: 0 },
    });
    const current = pinNodes(placed, {
      [id("c")]: { x: PITCH, y: 205 },
      [id("d")]: { x: 2 * PITCH, y: 9 },
    });
    expect(current.pinned).toEqual([id("c"), id("d")]);
    const answer = answerOf(current, sliceOf("a", [], ["c"]), [
      { nodeId: id("b"), slice: sliceOf("b", [], ["d"]) },
    ]);
    const { graph } = rebuildGraph(current, answer, GAP);
    expect(graph.pinned).toEqual([id("c")]);
    expect(graph.nodes[id("d")]).toBeUndefined();
    expect(graph.positions[id("d")]).toBeUndefined();
    expect(graph.positions[id("c")]).toEqual({ x: PITCH, y: 205 });
  });

  it("raises the revision and keeps generation, project, focus and gap", () => {
    const current: GraphState = {
      ...chain(),
      generation: 5,
      revision: 9,
      columnGap: 96,
      sourceVersion: 2,
    };
    const answer = answerOf(current, sliceOf("a", [], ["b"]), [], 8);
    const { graph } = rebuildGraph(current, answer, 96);
    expect(graph.revision).toBe(10);
    expect(graph.generation).toBe(5);
    expect(graph.project).toBe(current.project);
    expect(graph.focusId).toBe(id("a"));
    expect(graph.columnGap).toBe(96);
    expect(graph.sourceVersion).toBe(8);
  });

  it("leaves columnGap absent when the graph had none", () => {
    const current = chain();
    const { graph } = rebuildGraph(
      current,
      answerOf(current, sliceOf("a", [], ["b"])),
      GAP,
    );
    expect(Object.hasOwn(graph, "columnGap")).toBe(false);
  });
});
