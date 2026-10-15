import type { NodeId } from "@code-spider/core/types";
import { describe, expect, it, vi } from "vitest";
import { NODE_WIDTH } from "../../../src/graph/constants.js";
import type { layoutGraph } from "../../../src/graph/layout/layout.js";
import {
  layoutFor,
  pathPositions,
} from "../../../src/graph/layout/path-layout.js";
import { isClear, type Rect } from "../../../src/graph/layout/placement.js";
import { tidyGraph } from "../../../src/graph/layout/tidy-graph.js";
import { rowGap } from "../../../src/settings/column-gap.js";
import { mergeExpansion, pinNodes } from "../../../src/view/graph-state.js";
import type { GraphState, Point } from "../../../src/view/types.js";
import { commitCentre, createView } from "../../../src/view/view-state.js";
import { CLOSED_HEIGHT, OPEN_HEIGHT, rectOf } from "../../support/geometry.js";
import {
  calledSlice,
  graphOf,
  id,
  sliceOf,
} from "../../support/graph-states.js";
import {
  pathGraph,
  summary,
  type PathParts,
} from "../../support/path-graphs.js";
import { makeNode } from "../../support/slices.js";

const GAPS = [32, 192, 480];
const pitch = (gap: number) => NODE_WIDTH + gap;

/** Route columns as lists of names; the last column holds B alone. */
function partsOf(
  columns: string[][],
  slice: PathParts["slice"] = sliceOf("a", [], ["m"]),
): PathParts {
  const names = columns.flat();
  const end = columns.at(-1)?.[0] ?? "";
  return {
    slice,
    route: {
      nodes: names.map((name) => makeNode({ id: id(name) })),
      edges: [],
    },
    path: {
      endId: id(end),
      boxes: columns.flatMap((column, index) =>
        column.map((name) => ({ id: id(name), column: index })),
      ),
      edgeIds: [],
      summary: summary(),
    },
  };
}

const COLUMNS = [["a"], ["m", "p"], ["t", "u", "v"], ["z"]];

function graphWith(slice?: PathParts["slice"], columns = COLUMNS): GraphState {
  return pathGraph(partsOf(columns, slice));
}

function placed(graph: GraphState, gap: number, names: string[]): Rect[] {
  const positions = pathPositions(graph, gap);
  return names.map((name) => {
    const at = positions[id(name)];
    if (!at) throw new Error(`${name} was not placed`);
    return rectOf({ ...graph, positions }, id(name));
  });
}

function expectNoOverlap(graph: GraphState, positions: Record<NodeId, Point>) {
  const full = { ...graph, positions };
  const rects = Object.keys(positions).map((key) => rectOf(full, key));
  for (const [index, a] of rects.entries()) {
    for (const b of rects.slice(index + 1)) {
      expect(isClear(a, b, 0)).toBe(true);
    }
  }
}

describe("pathPositions for the route boxes", () => {
  it("puts each box at column * (NODE_WIDTH + gap)", () => {
    const graph = graphWith();
    for (const gap of GAPS) {
      const positions = pathPositions(graph, gap);
      for (const box of graph.path?.boxes ?? []) {
        expect(positions[box.id]?.x).toBe(box.column * pitch(gap));
      }
    }
  });

  it("leaves A alone at the far left and B alone at the far right", () => {
    const graph = graphWith();
    const positions = pathPositions(graph, 192);
    const routeX = (graph.path?.boxes ?? []).map((box) => positions[box.id]?.x);
    expect(routeX.filter((x) => x === 0)).toHaveLength(1);
    expect(positions[id("a")]?.x).toBe(Math.min(...(routeX as number[])));
    expect(routeX.filter((x) => x === 3 * pitch(192))).toHaveLength(1);
    expect(positions[id("z")]?.x).toBe(Math.max(...(routeX as number[])));
  });

  it("stacks a column in path.boxes order, centred on y = 0", () => {
    const graph = graphWith();
    for (const gap of GAPS) {
      const [t, u, v] = placed(graph, gap, ["t", "u", "v"]) as [
        Rect,
        Rect,
        Rect,
      ];
      expect(u.y).toBe(t.y + CLOSED_HEIGHT + rowGap(gap));
      expect(v.y).toBe(u.y + CLOSED_HEIGHT + rowGap(gap));
      expect((t.y + v.y + v.height) / 2).toBeCloseTo(0);
    }
  });

  it("stacks open boxes at the height they are drawn at", () => {
    const graph = { ...graphWith(), open: [id("a"), id("z"), id("u")] };
    const [t, u, v] = placed(graph, 192, ["t", "u", "v"]) as [Rect, Rect, Rect];
    expect(u.height).toBe(OPEN_HEIGHT);
    expect(u.y).toBe(t.y + CLOSED_HEIGHT + rowGap(192));
    expect(v.y).toBe(u.y + OPEN_HEIGHT + rowGap(192));
    expect((t.y + v.y + v.height) / 2).toBeCloseTo(0);
  });
});

describe("pathPositions for A's neighbourhood", () => {
  const slice = calledSlice("a", ["s2", "s1"], ["m", "c1", "c2"]);

  it("puts A's callees in the column left of A in code order", () => {
    const positions = pathPositions(graphWith(slice), 192);
    expect(positions[id("s2")]?.x).toBe(-pitch(192));
    expect(positions[id("s1")]?.x).toBe(-pitch(192));
    expect(positions[id("s2")]!.y).toBeLessThan(positions[id("s1")]!.y);
  });

  it("puts A's other neighbours in the column right of A, never over a route box", () => {
    for (const gap of GAPS) {
      const graph = graphWith(slice);
      const positions = pathPositions(graph, gap);
      for (const name of ["c1", "c2"]) {
        expect(positions[id(name)]?.x).toBe(pitch(gap));
      }
      expectNoOverlap(graph, positions);
    }
  });

  it("moves no route box for A's neighbours", () => {
    const bare = pathPositions(graphWith(), 192);
    const crowded = pathPositions(graphWith(slice), 192);
    for (const box of graphWith().path?.boxes ?? []) {
      expect(crowded[box.id]).toEqual(bare[box.id]);
    }
  });

  it("keeps a box that is a route box and a neighbour at its route position", () => {
    const bare = pathPositions(graphWith(), 192);
    const crowded = pathPositions(graphWith(slice), 192);
    expect(crowded[id("m")]).toEqual(bare[id("m")]);
    expect(crowded[id("m")]?.x).toBe(pitch(192));
  });

  it("places the boxes an expansion added around the box they came from", () => {
    const expanded = mergeExpansion(
      graphWith(slice),
      id("t"),
      sliceOf("t", ["q"], ["r"]),
    ).graph;
    const positions = pathPositions(expanded, 192);
    expect(positions[id("q")]?.x).toBe(positions[id("t")]!.x - pitch(192));
    expect(positions[id("r")]?.x).toBe(positions[id("t")]!.x + pitch(192));
    expectNoOverlap(expanded, positions);
  });

  it("overlaps nothing at gaps 32, 192 and 480", () => {
    const crowded = mergeExpansion(
      graphWith(slice),
      id("u"),
      sliceOf("u", ["q1", "q2"], ["r1", "r2"]),
    ).graph;
    for (const gap of GAPS) {
      expectNoOverlap(crowded, pathPositions(crowded, gap));
    }
  });
});

describe("layoutFor", () => {
  const elkResult = { [id("a")]: { x: 1, y: 2 } };

  it("gives ELK's result for a graph without path", async () => {
    const elk = vi.fn<typeof layoutGraph>(async () => elkResult);
    const graph = graphOf("a", ["b"]);
    await expect(layoutFor(graph, 192, elk)).resolves.toEqual(elkResult);
    expect(elk).toHaveBeenCalledWith(graph, 192);
  });

  it("does not call ELK for a graph with path", async () => {
    const elk = vi.fn<typeof layoutGraph>(async () => elkResult);
    const graph = graphWith();
    await expect(layoutFor(graph, 192, elk)).resolves.toEqual(
      pathPositions(graph, 192),
    );
    expect(elk).not.toHaveBeenCalled();
  });
});

describe("Tidy on a path graph", () => {
  function committed(graph: GraphState): GraphState {
    const current = commitCentre(createView(), graph).current;
    if (!current) throw new Error("no graph");
    return current;
  }
  const slice = calledSlice("a", ["s2", "s1"], ["m", "c1", "c2"]);

  it("keeps route boxes in their columns and overlaps nothing", async () => {
    const graph = committed(graphWith(slice));
    const outcome = await tidyGraph(() => graph, () => 192, layoutFor);
    const positions = outcome?.positions ?? {};
    for (const box of graph.path?.boxes ?? []) {
      expect(positions[box.id]?.x).toBe(box.column * pitch(192));
    }
    expectNoOverlap(graph, positions);
  });

  it("leaves a pinned route box where it is and clears it", async () => {
    const pinnedAt = { x: pitch(192), y: 300 };
    const graph = pinNodes(committed(graphWith(slice)), {
      [id("p")]: pinnedAt,
    });
    const outcome = await tidyGraph(() => graph, () => 192, layoutFor);
    const positions = outcome?.positions ?? {};
    expect(positions[id("p")]).toEqual(pinnedAt);
    expectNoOverlap(graph, positions);
  });
});
