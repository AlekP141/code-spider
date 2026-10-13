import { describe, expect, it } from "vitest";
import { rowGap } from "../../src/settings/column-gap.js";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { nodeHeight } from "../../src/graph/nodes/node-size.js";
import { mergeExpansion } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import { OPEN_HEIGHT, CLOSED_HEIGHT } from "../support/geometry.js";
import { makeEdge, makeNode, makeSlice } from "../support/slices.js";
import {
  answerOf,
  graphOf,
  id,
  openAll,
  sliceOf,
  tweakNode,
  withPositions,
} from "../support/graph-states.js";

const GAP = 192;
const MARGIN = rowGap(GAP);
const PITCH = NODE_WIDTH + GAP;
const HEIGHT = OPEN_HEIGHT;

describe("rebuildGraph places and makes room", () => {
  it("places a node the centre and an expansion both list for the centre", () => {
    const base = graphOf("a", [], ["b"]);
    const current = withPositions(
      mergeExpansion(base, id("b"), sliceOf("b", [], ["x"])).graph,
      {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: PITCH, y: 0 },
        [id("x")]: { x: 2 * PITCH, y: 0 },
      },
    );
    const answer = answerOf(current, sliceOf("a", [], ["b", "c"]), [
      { nodeId: id("b"), slice: sliceOf("b", [], ["c", "d"]) },
    ]);
    const { graph, added } = rebuildGraph(current, answer, GAP);
    expect([...added].sort()).toEqual([id("c"), id("d")]);
    expect(graph.positions[id("c")]?.x).toBe(PITCH);
    expect(graph.positions[id("d")]?.x).toBe(2 * PITCH);
  });

  it("lists no added ids when nothing is new", () => {
    const current = withPositions(graphOf("a", [], ["b"]), {
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: PITCH, y: 0 },
    });
    const { added } = rebuildGraph(
      current,
      answerOf(current, sliceOf("a", [], ["b"])),
      GAP,
    );
    expect(added).toEqual([]);
  });

  it("slides the box below a grown box down by the overlap plus the margin", () => {
    const current = openAll(
      withPositions(graphOf("a", [], ["b", "c"]), {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: PITCH, y: 0 },
        [id("c")]: { x: PITCH, y: HEIGHT + MARGIN },
      }),
    );
    const grown = tweakNode(sliceOf("a", [], ["b", "c"]), "b", {
      lineCount: 10,
    });
    const grownHeight = nodeHeight({ lineCount: 10, codePreview: "x" }, true);
    const overlap = grownHeight - (HEIGHT + MARGIN);
    expect(overlap).toBeGreaterThan(0);
    const { graph } = rebuildGraph(current, answerOf(current, grown), GAP);
    expect(graph.positions[id("b")]).toEqual({ x: PITCH, y: 0 });
    expect(graph.positions[id("c")]).toEqual({
      x: PITCH,
      y: HEIGHT + MARGIN + overlap + MARGIN,
    });
  });

  it("places a new node clear of a box that grew into its column", () => {
    const current = openAll(
      withPositions(graphOf("a", [], ["b"]), {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: PITCH, y: 0 },
      }),
    );
    const grown = tweakNode(sliceOf("a", [], ["b", "c"]), "b", {
      lineCount: 10,
    });
    const { graph } = rebuildGraph(current, answerOf(current, grown), GAP);
    const b = graph.positions[id("b")];
    const c = graph.positions[id("c")];
    expect(b).toEqual({ x: PITCH, y: 0 });
    expect(c?.x).toBe(PITCH);
    const bBottom = nodeHeight({ lineCount: 10, codePreview: "x" }, true);
    const cTop = c?.y ?? 0;
    const cBottom = cTop + CLOSED_HEIGHT;
    expect(cTop >= bBottom + MARGIN || cBottom + MARGIN <= 0).toBe(true);
  });

  it("does not change the graph or the answer it was given", () => {
    const current = withPositions(graphOf("a", [], ["b"]), {
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: PITCH, y: 0 },
    });
    const before = structuredClone(current);
    const answer = answerOf(current, sliceOf("a", [], ["b", "z"]), [
      { nodeId: id("b"), slice: sliceOf("b", [], ["c"]) },
    ]);
    const frozen = structuredClone(answer);
    rebuildGraph(current, answer, GAP);
    expect(current).toEqual(before);
    expect(answer).toEqual(frozen);
  });

  it("places a node two expanded boxes list beside the one expanded first, whatever the answer order", () => {
    const base = graphOf("a", [], ["p", "q"]);
    const withQ = mergeExpansion(base, id("q"), sliceOf("q", [], ["u"])).graph;
    const current = withPositions(
      mergeExpansion(withQ, id("p"), sliceOf("p", [], ["v"])).graph,
      {
        [id("a")]: { x: 0, y: 500 },
        [id("q")]: { x: PITCH, y: 0 },
        [id("p")]: { x: PITCH, y: 1000 },
        [id("u")]: { x: 2 * PITCH, y: -400 },
        [id("v")]: { x: 2 * PITCH, y: 1400 },
      },
    );
    expect(Object.keys(current.slices)).toEqual(["a", "q", "p"].map(id));
    const slices = [
      { nodeId: id("p"), slice: sliceOf("p", [], ["x"]) },
      { nodeId: id("q"), slice: sliceOf("q", [], ["x"]) },
    ];
    const centre = sliceOf("a", [], ["p", "q"]);
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
    expect(forward.graph.positions[id("x")]?.y).toBeLessThan(500);
  });

  it("applies each expansion once when slices list each other or themselves", () => {
    const selfLoop = makeSlice(
      id("c"),
      [makeNode({ id: id("c") })],
      [makeEdge(id("c"), id("c"))],
    );
    const base = graphOf("a", [], ["b", "c"]);
    const withB = mergeExpansion(base, id("b"), sliceOf("b", [], ["a"])).graph;
    const current = withPositions(
      mergeExpansion(withB, id("c"), selfLoop).graph,
      {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: PITCH, y: 0 },
        [id("c")]: { x: PITCH, y: 300 },
      },
    );
    const answer = answerOf(current, sliceOf("a", [], ["b", "c"]), [
      { nodeId: id("c"), slice: selfLoop },
      { nodeId: id("b"), slice: sliceOf("b", [], ["a"]) },
      { nodeId: id("b"), slice: sliceOf("b", [], ["a"]) },
    ]);
    const { graph, added } = rebuildGraph(current, answer, GAP);
    expect(Object.keys(graph.slices)).toEqual(["a", "b", "c"].map(id));
    expect(Object.keys(graph.nodes).sort()).toEqual(["a", "b", "c"].map(id));
    expect(graph.slices[id("b")]?.members).toEqual([id("a")]);
    expect(graph.slices[id("c")]?.members).toEqual([]);
    expect(graph.edges[`${id("c")}->${id("c")}`]).toBeDefined();
    expect(added).toEqual([]);
  });
});
