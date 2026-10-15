import { describe, expect, it } from "vitest";
import type { GraphNode } from "@code-spider/core/types";
import { createAppState, reduceApp } from "../../src/app/app-state.js";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { isClear } from "../../src/graph/layout/placement.js";
import { rowGap } from "../../src/settings/column-gap.js";
import { rectsOf } from "../../src/view/expansion.js";
import { commitCentre } from "../../src/view/view-state.js";
import { hiddenIds } from "../../src/view/test-visibility.js";
import type { GraphState } from "../../src/view/types.js";
import { id } from "../support/graph-states.js";
import { pathGraph, pathParts } from "../support/path-graphs.js";
import type { PathParts } from "../support/path-graphs.js";
import { makeEdge, makeNode } from "../support/slices.js";

function graphWith(
  testNames: string[],
  extra: (parts: PathParts) => PathParts = (parts) => parts,
): GraphState {
  const parts = extra(pathParts());
  const mark = (node: GraphNode): GraphNode =>
    testNames.some((name) => id(name) === node.id)
      ? { ...node, isTest: true }
      : node;
  return pathGraph({
    ...parts,
    slice: { ...parts.slice, nodes: parts.slice.nodes.map(mark) },
    route: { ...parts.route, nodes: parts.route.nodes.map(mark) },
  });
}

const PITCH = NODE_WIDTH + 192;

describe("hiddenIds on a path graph", () => {
  it("never hides B, whether or not it is test code", () => {
    expect([...hiddenIds(graphWith([]), "hide")]).toEqual([]);
    expect([...hiddenIds(graphWith(["z"]), "hide")]).not.toContain(id("z"));
    expect([...hiddenIds(graphWith(["a", "z"]), "hide")]).toEqual([]);
  });

  it("hides A's test neighbours with the boxes that only lead to them", () => {
    const hidden = hiddenIds(
      graphWith(["s"], (parts) => ({
        ...parts,
        slice: {
          ...parts.slice,
          nodes: [...parts.slice.nodes, makeNode({ id: id("u") })],
          edges: [...parts.slice.edges, makeEdge(id("s"), id("u"))],
        },
      })),
      "hide",
    );
    expect([...hidden].sort()).toEqual([id("s"), id("u")].sort());
  });

  it("keeps boxes reached only through a test B visible", () => {
    const hidden = hiddenIds(
      graphWith(["z"], (parts) => ({
        ...parts,
        route: {
          nodes: [...parts.route.nodes, makeNode({ id: id("y") })],
          edges: [...parts.route.edges, makeEdge(id("z"), id("y"))],
        },
        path: {
          ...parts.path,
          boxes: [...parts.path.boxes, { id: id("y"), column: 3 }],
        },
      })),
      "hide",
    );
    expect([...hidden]).toEqual([]);
  });

  it("seeds from the centre only on a graph without path", () => {
    const { path: _path, ...plain } = graphWith(["z"]);
    const hidden = hiddenIds(plain as GraphState, "hide");
    expect([...hidden]).toEqual([id("z")]);
  });

  it("places a hidden neighbour of A beside A when it is shown again and overlaps nothing", () => {
    const graph = {
      ...graphWith(["s"]),
      positions: {
        [id("a")]: { x: 1000, y: 500 },
        [id("m")]: { x: 1000 + PITCH, y: 500 },
        [id("z")]: { x: 1000 + 2 * PITCH, y: 500 },
      },
    };
    const start = createAppState(undefined);
    const shown = {
      ...start,
      view: commitCentre(start.view, graph),
    };
    const hiding = reduceApp(shown, {
      type: "testVisibilityChanged",
      value: "hide",
    });
    expect(hiding.view.current?.positions[id("s")]).toBeUndefined();
    const back = reduceApp(hiding, {
      type: "testVisibilityChanged",
      value: "show",
    });
    const placed = back.view.current;
    const at = placed?.positions[id("s")];
    expect(at).toBeDefined();
    expect(Math.abs((at?.x ?? 0) - 1000)).toBe(PITCH);
    const rects = placed ? rectsOf(placed) : [];
    expect(rects).toHaveLength(4);
    for (const [index, rect] of rects.entries()) {
      for (const other of rects.slice(index + 1)) {
        expect(isClear(rect, other, rowGap(back.view.columnGap))).toBe(true);
      }
    }
  });
});
