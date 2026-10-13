import { describe, expect, it } from "vitest";
import { layoutGraph } from "../../src/graph/layout/layout.js";
import { isClear, TOLERANCE } from "../../src/graph/layout/placement.js";
import { tidyGraph } from "../../src/graph/layout/tidy-graph.js";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { nodeHeight } from "../../src/graph/nodes/node-size.js";
import { rowGap } from "../../src/settings/column-gap.js";
import { applyExpansion, rectsOf } from "../../src/view/expansion.js";
import {
  graphFromSlice,
  pinNodes,
  setPositions,
} from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { GraphState } from "../../src/view/types.js";
import { CLOSED_HEIGHT, OPEN_HEIGHT, rectOf } from "../support/geometry.js";
import {
  answerOf,
  calledSlice,
  graphOf,
  id,
  PROJECT,
  sliceOf,
  tweakNode,
  withPositions,
} from "../support/graph-states.js";
import { crowded } from "../support/order-graphs.js";

const GAP = 192;
const MARGIN = rowGap(GAP);
const PITCH = NODE_WIDTH + GAP;

describe("rectsOf", () => {
  it("gives an open box its full height and a closed box the header height", () => {
    const graph = withPositions(graphOf("a", [], ["b"]), {
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: PITCH, y: 0 },
    });
    const heightAt = (x: number) =>
      rectsOf(graph).find((rect) => rect.x === x)?.height;
    expect(heightAt(0)).toBe(OPEN_HEIGHT);
    expect(heightAt(PITCH)).toBe(CLOSED_HEIGHT);
  });
});

describe("applyExpansion with open boxes", () => {
  const twoBoxes = (open: string[]): GraphState => ({
    ...setPositions(graphOf("a", ["b"]), {
      [id("a")]: { x: 1000, y: 500 },
      [id("b")]: { x: 488, y: 500 },
    }),
    open: open.map(id),
  });

  it("centres the new column on the full height of an open expanded box", () => {
    const { graph } = applyExpansion(
      twoBoxes(["a", "b"]),
      id("b"),
      sliceOf("b", ["d"]),
      GAP,
    );
    expect(graph.positions[id("d")]).toEqual({
      x: 488 - PITCH,
      y: 500 + OPEN_HEIGHT / 2 - CLOSED_HEIGHT / 2,
    });
  });

  it("keeps new boxes clear of an open box's code region", () => {
    const lowered = setPositions(twoBoxes(["a"]), {
      [id("b")]: { x: 488, y: 500 + OPEN_HEIGHT },
    });
    const { graph } = applyExpansion(
      lowered,
      id("b"),
      sliceOf("b", [], ["a", "e"]),
      GAP,
    );
    const e = rectOf({ ...graph, open: [id("a")] }, id("e"));
    expect(e.y).toBe(500 + OPEN_HEIGHT + MARGIN);
    expect(isClear(e, rectOf(graph, id("a")), MARGIN)).toBe(true);
  });

  it("stacks new boxes at the closed height, a row gap apart", () => {
    const current = withPositions(graphOf("a", [], ["b"]), {
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: PITCH, y: 0 },
    });
    const { graph } = applyExpansion(
      current,
      id("b"),
      sliceOf("b", [], ["x", "y"]),
      GAP,
    );
    const top = (name: string) => graph.positions[id(name)]?.y ?? Number.NaN;
    expect(top("y") - top("x")).toBe(CLOSED_HEIGHT + MARGIN);
  });
});

describe("rebuildGraph with open boxes", () => {
  const stacked = (open: string[], bottomTop: number): GraphState => ({
    ...withPositions(graphOf("a", [], ["b", "c"]), {
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: PITCH, y: 0 },
      [id("c")]: { x: PITCH, y: bottomTop },
    }),
    open: open.map(id),
  });
  const grown = tweakNode(sliceOf("a", [], ["b", "c"]), "b", {
    lineCount: 10,
  });

  it("gives room to an open kept box that grew, pushing the box below by the overlap", () => {
    const cTop = OPEN_HEIGHT + MARGIN;
    const current = stacked(["a", "b", "c"], cTop);
    const grownHeight = nodeHeight({ lineCount: 10, codePreview: "x" }, true);
    const overlap = grownHeight - cTop;
    expect(overlap).toBeGreaterThan(0);
    const { graph } = rebuildGraph(current, answerOf(current, grown), GAP);
    expect(graph.positions[id("b")]).toEqual({ x: PITCH, y: 0 });
    expect(graph.positions[id("c")]).toEqual({
      x: PITCH,
      y: cTop + overlap + MARGIN,
    });
  });

  it("moves nothing when a closed box's code grew", () => {
    const current = stacked(["a"], CLOSED_HEIGHT + MARGIN);
    const { graph } = rebuildGraph(current, answerOf(current, grown), GAP);
    expect(graph.positions).toEqual(current.positions);
  });

  it("places a new box at the closed height", () => {
    const current = withPositions(graphOf("a"), {
      [id("a")]: { x: 0, y: 0 },
    });
    const centre = sliceOf("a", [], ["c", "d"]);
    const answer = answerOf(current, centre);
    const { graph, added } = rebuildGraph(current, answer, GAP);
    expect(added.sort()).toEqual([id("c"), id("d")]);
    const top = (name: string) => graph.positions[id(name)]?.y ?? Number.NaN;
    expect(top("d") - top("c")).toBe(CLOSED_HEIGHT + MARGIN);
  });
});

describe("tidyGraph with open boxes", () => {
  const column: typeof layoutGraph = async (graph) =>
    Object.fromEntries(
      Object.keys(graph.nodes).map((nodeId, index) => [
        nodeId,
        { x: 0, y: index * 200 },
      ]),
    );
  const tidy = (graph: GraphState) =>
    tidyGraph(
      () => graph,
      () => GAP,
      column,
    );

  it("keeps clear of a pinned open box by its full height and of a pinned closed box by the header only", async () => {
    const base = graphOf("a", ["b"], ["c"]);
    const openPinned = await tidy(
      pinNodes(base, { [id("a")]: { x: 0, y: 300 } }),
    );
    expect(openPinned?.positions[id("c")]).toEqual({
      x: 0,
      y: 300 + OPEN_HEIGHT + MARGIN,
    });
    const closedPinned = await tidy(
      pinNodes(base, { [id("b")]: { x: 0, y: 400 } }),
    );
    expect(closedPinned?.positions[id("c")]).toEqual({
      x: 0,
      y: 400 + CLOSED_HEIGHT + MARGIN,
    });
  });
});

describe("layoutGraph with open boxes", () => {
  it("keeps the row gap between an open and a closed box in one column", async () => {
    const graph = {
      ...graphFromSlice(calledSlice("f", ["c0", "c1", "c2"]), PROJECT),
      open: [id("f"), id("c0")],
    };
    const positions = await layoutGraph(graph, GAP);
    const top = (name: string) => positions[id(name)]?.y ?? Number.NaN;
    expect(top("c1") - top("c0")).toBeGreaterThanOrEqual(
      OPEN_HEIGHT + MARGIN - TOLERANCE,
    );
    expect(top("c2") - top("c1")).toBeCloseTo(CLOSED_HEIGHT + MARGIN, 6);
    expect(crowded(graph, positions, GAP)).toEqual([]);
  });
});
