import type { GraphSlice, PathRoute } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { rowGap } from "../../src/settings/column-gap.js";
import { nodeHeight } from "../../src/graph/nodes/node-size.js";
import { mergeExpansion } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import { rebuildPathGraph } from "../../src/view/refresh-path.js";
import type { GraphState } from "../../src/view/types.js";
import {
  calledSlice,
  id,
  nodeIds,
  openAll,
  sliceOf,
  tweakNode,
} from "../support/graph-states.js";
import { OPEN_HEIGHT } from "../support/geometry.js";
import { pathGraph, pathInfo, routeOf } from "../support/path-graphs.js";
import {
  GAP,
  ids,
  partsOf,
  pathAnswer,
  PITCH,
  placed,
  placedPath,
} from "../support/path-refresh.js";
import { makeEdge, makeNode } from "../support/slices.js";

const MARGIN = rowGap(GAP);

function through(names: string[], links: [string, string][]): PathRoute {
  return {
    nodes: names.map((name) => makeNode({ id: id(name) })),
    edges: links.map(([from, to]) => makeEdge(id(from), id(to))),
  };
}

function freshParts() {
  const fresh = { returnType: "fresh" };
  const route = routeOf(["a", "m", "z"], {
    a: fresh,
    m: { ...fresh, name: "route m" },
    z: fresh,
  });
  const slice: GraphSlice = sliceOf("a", ["s"], ["m"]);
  return {
    slice: {
      ...slice,
      nodes: slice.nodes.map((node) => ({ ...node, returnType: "fresh" })),
      edges: slice.edges.map((edge) => ({ ...edge, resolved: false })),
    },
    route: {
      ...route,
      edges: route.edges.map((edge) => ({ ...edge, resolved: false })),
    },
    path: pathInfo(
      ["a", "m", "z"],
      route.edges.map((edge) => edge.id),
    ),
  };
}

function unchanged() {
  return partsOf(sliceOf("a", ["s"], ["m"]), routeOf(["a", "m", "z"]));
}

describe("rebuildPathGraph replaces and places", () => {
  it("replaces the old data with A's new slice and the fresh route", () => {
    const current = placedPath();
    const stale: GraphState = {
      ...current,
      nodes: Object.fromEntries(
        Object.entries(current.nodes).map(([key, node]) => [
          key,
          { ...node, returnType: "stale" },
        ]),
      ),
    };
    const parts = freshParts();
    const { graph } = rebuildPathGraph(stale, pathAnswer(stale, parts), GAP);
    expect(nodeIds(graph)).toEqual(ids("a", "m", "s", "z"));
    for (const node of Object.values(graph.nodes)) {
      expect(node.returnType).toBe("fresh");
    }
    for (const edge of Object.values(graph.edges)) {
      expect(edge.resolved).toBe(false);
    }
    expect(graph.nodes[id("m")]?.name).toBe("route m");
    expect(graph.path).toEqual(parts.path);
  });

  it("applies A's slice, then the route keyed A, then the expansions", () => {
    const expanded = mergeExpansion(
      pathGraph(),
      id("z"),
      sliceOf("z", [], ["v"]),
    ).graph;
    const current = placed(expanded, { v: { x: 3 * PITCH, y: 0 } });
    const route = through(
      ["a", "m", "n", "z", "x"],
      [
        ["a", "m"],
        ["m", "n"],
        ["n", "z"],
        ["x", "m"],
      ],
    );
    const parts = partsOf(sliceOf("a", ["s", "x"], ["m"]), route);
    const answer = pathAnswer(current, parts, [
      { nodeId: id("z"), slice: sliceOf("z", [], ["v", "w"]) },
    ]);
    const { graph, added } = rebuildPathGraph(current, answer, GAP);
    expect([...added].sort()).toEqual(ids("n", "w", "x"));
    expect(graph.positions[id("x")]?.x).toBe(-PITCH);
    expect(graph.positions[id("n")]?.x).toBe(PITCH);
    expect(graph.positions[id("w")]?.x).toBe(3 * PITCH);
  });

  it("keeps a box where it is and never moves a pinned one", () => {
    const positions = {
      [id("s")]: { x: -PITCH + 3, y: 11 },
      [id("a")]: { x: 0, y: 0 },
      [id("m")]: { x: PITCH + 17, y: 33 },
      [id("z")]: { x: 2 * PITCH + 9, y: 77 },
    };
    const current: GraphState = {
      ...placedPath(),
      positions,
      pinned: [id("z")],
    };
    const { graph, added } = rebuildPathGraph(
      current,
      pathAnswer(current, unchanged()),
      GAP,
    );
    expect(graph.positions).toEqual(positions);
    expect(graph.pinned).toEqual([id("z")]);
    expect(added).toEqual([]);
  });

  it("gives room to the box below one that grew", () => {
    const parts = partsOf(
      sliceOf("a", ["s"], ["m", "c"]),
      routeOf(["a", "m", "z"]),
    );
    const current = openAll(
      placed(pathGraph(parts), { c: { x: PITCH, y: OPEN_HEIGHT + MARGIN } }),
    );
    const grown = {
      ...parts,
      slice: tweakNode(parts.slice, "m", { lineCount: 10 }),
      route: routeOf(["a", "m", "z"], { m: { lineCount: 10 } }),
    };
    const answer = pathAnswer(current, grown);
    const { graph } = rebuildPathGraph(current, answer, GAP);
    const height = nodeHeight({ lineCount: 10, codePreview: "x" }, true);
    expect(graph.positions[id("m")]).toEqual({ x: PITCH, y: 0 });
    expect(graph.positions[id("c")]).toEqual({
      x: PITCH,
      y: height + MARGIN,
    });
  });

  it("does not restack the boxes the layout placed in call order", () => {
    const slice = calledSlice("a", ["s1", "s2"], ["m"]);
    const parts = partsOf(slice, routeOf(["a", "m", "z"]));
    const current = placed(pathGraph(parts), {
      s1: { x: -PITCH, y: 400 },
      s2: { x: -PITCH, y: 0 },
    });
    const answer = pathAnswer(current, parts);
    const { graph } = rebuildPathGraph(current, answer, GAP);
    expect(graph.positions).toEqual(current.positions);
    const { path: _path, ...plain } = current;
    const { route: _route, path: _info, ...ordinary } = answer;
    const restacked = rebuildGraph(plain, ordinary, GAP);
    expect(restacked.graph.positions[id("s1")]?.y).toBeLessThan(
      restacked.graph.positions[id("s2")]?.y ?? 0,
    );
  });
});
