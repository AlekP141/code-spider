import { describe, expect, it } from "vitest";
import { isClear, type Rect } from "../../src/graph/layout/placement.js";
import { rowGap } from "../../src/settings/column-gap.js";
import {
  graphFromSlice,
  mergeExpansion,
  pinNodes,
} from "../../src/view/graph-state.js";
import { rectsOf } from "../../src/view/expansion.js";
import { placeUnpositioned } from "../../src/view/place-unpositioned.js";
import type { GraphState } from "../../src/view/types.js";
import { rectOf } from "../support/geometry.js";
import {
  calledSlice,
  graphOf,
  id,
  PROJECT,
  sliceOf,
  withPositions,
} from "../support/graph-states.js";
import { makeNode } from "../support/slices.js";
import { PITCH } from "../support/hidden-graphs.js";

const GAP = 192;

function atCentre(graph: GraphState): GraphState {
  return withPositions(graph, { [id("a")]: { x: 1000, y: 500 } });
}

function expectAllClear(rects: Rect[]) {
  for (const [index, rect] of rects.entries()) {
    for (const other of rects.slice(index + 1)) {
      expect(isClear(rect, other, rowGap(GAP))).toBe(true);
    }
  }
}

describe("placeUnpositioned", () => {
  it("returns the very same graph when every box has a position", () => {
    const graph = withPositions(graphOf("a", ["s"]), {
      [id("a")]: { x: 1000, y: 500 },
      [id("s")]: { x: 488, y: 500 },
    });
    expect(placeUnpositioned(graph, GAP)).toBe(graph);
  });

  it("puts a positionless box the owner calls left of it and one that calls the owner right of it", () => {
    const graph = atCentre(graphOf("a", ["s"], ["k"]));
    const placed = placeUnpositioned(graph, GAP);
    expect(placed.positions[id("s")]?.x).toBe(1000 - PITCH);
    expect(placed.positions[id("k")]?.x).toBe(1000 + PITCH);
  });

  it("stacks positionless called boxes in code order", () => {
    const graph = graphFromSlice(
      calledSlice("a", ["z", "y", "x"]),
      PROJECT,
      { [id("a")]: { x: 1000, y: 500 } },
    );
    const placed = placeUnpositioned(graph, GAP);
    const ys = ["z", "y", "x"].map(
      (name) => placed.positions[id(name)]?.y ?? 0,
    );
    expect(ys[0]).toBeLessThan(ys[1] ?? 0);
    expect(ys[1]).toBeLessThan(ys[2] ?? 0);
    for (const name of ["z", "y", "x"]) {
      expect(placed.positions[id(name)]?.x).toBe(1000 - PITCH);
    }
  });

  it("never moves a positioned box, pinned or not, and keeps every placed box the row gap clear", () => {
    const beside = { x: 1000 + PITCH, y: 500 };
    const graph = pinNodes(
      withPositions(graphOf("a", ["s"], ["k", "b"]), {
        [id("a")]: { x: 1000, y: 500 },
        [id("b")]: beside,
      }),
      { [id("b")]: beside },
    );
    const placed = placeUnpositioned(graph, GAP);
    expect(placed.positions[id("a")]).toEqual({ x: 1000, y: 500 });
    expect(placed.positions[id("b")]).toEqual(beside);
    expect(placed.pinned).toEqual([id("b")]);
    expect(Object.keys(placed.positions)).toHaveLength(4);
    expectAllClear(rectsOf(placed));
  });

  it("places each slice's boxes in slice order, later groups clear of earlier ones", () => {
    const first = withPositions(graphOf("a", [], ["b", "c", "d"]), {
      [id("a")]: { x: 1000, y: 500 },
      [id("b")]: { x: 1000, y: 640 },
    });
    const full = mergeExpansion(
      first,
      id("b"),
      sliceOf("b", [], ["e", "f", "g"]),
    ).graph;
    const placed = placeUnpositioned(full, GAP);
    const alone = placeUnpositioned(first, GAP);
    for (const name of ["c", "d"]) {
      expect(placed.positions[id(name)]).toEqual(alone.positions[id(name)]);
    }
    for (const name of ["e", "f", "g"]) {
      expect(placed.positions[id(name)]?.x).toBe(1000 + PITCH);
    }
    expect(Object.keys(placed.positions)).toHaveLength(7);
    expectAllClear(rectsOf(placed));
  });

  it("places a box no slice lists around the centre", () => {
    const graph = atCentre(graphOf("a"));
    const stray = makeNode({ id: id("z") });
    const withStray = {
      ...graph,
      nodes: { ...graph.nodes, [stray.id]: stray },
    };
    const placed = placeUnpositioned(withStray, GAP);
    expect(placed.positions[id("z")]?.x).toBe(1000 + PITCH);
    expectAllClear(rectsOf(placed));
    expect(rectOf(placed, id("a")).x).toBe(1000);
  });

  it("changes only positions and revision", () => {
    const graph = atCentre(graphOf("a", ["s"], ["k"]));
    const placed = placeUnpositioned(graph, GAP);
    expect(placed.revision).toBe(graph.revision + 1);
    expect({
      ...placed,
      positions: graph.positions,
      revision: graph.revision,
    }).toEqual(graph);
  });
});
