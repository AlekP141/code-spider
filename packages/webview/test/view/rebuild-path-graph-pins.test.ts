import type { PathRoute } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { rowGap } from "../../src/settings/column-gap.js";
import { isClear } from "../../src/graph/layout/placement.js";
import { mergeExpansion } from "../../src/view/graph-state.js";
import { rebuildPathGraph } from "../../src/view/refresh-path.js";
import type { GraphState } from "../../src/view/types.js";
import { id, sliceOf } from "../support/graph-states.js";
import { rectOf } from "../support/geometry.js";
import { pathGraph, routeOf } from "../support/path-graphs.js";
import {
  GAP,
  ids,
  partsOf,
  pathAnswer,
  PITCH,
  placed,
} from "../support/path-refresh.js";
import { makeEdge, makeNode } from "../support/slices.js";

const EXPAND_M = [{ nodeId: id("m"), slice: sliceOf("m", [], ["mm"]) }];

function withExpandedM(): GraphState {
  const expanded = mergeExpansion(
    pathGraph(),
    id("m"),
    sliceOf("m", [], ["mm"]),
  ).graph;
  return placed(expanded, { mm: { x: PITCH, y: 400 } });
}

function sameRoute() {
  return partsOf(sliceOf("a", ["s"], ["m"]), routeOf(["a", "m", "z"]));
}

function viaQ() {
  const route: PathRoute = {
    nodes: ["a", "q", "z"].map((name) => makeNode({ id: id(name) })),
    edges: [makeEdge(id("a"), id("q")), makeEdge(id("q"), id("z"))],
  };
  return partsOf(sliceOf("a", ["s"], ["q"]), route);
}

describe("rebuildPathGraph and the boxes that leave", () => {
  it("removes a box that is no longer on a route when it is not pinned", () => {
    const current = placed(pathGraph());
    const answer = pathAnswer(current, viaQ());
    const { graph } = rebuildPathGraph(current, answer, GAP);
    expect(Object.keys(graph.nodes).sort()).toEqual(ids("a", "q", "s", "z"));
    expect(graph.positions[id("m")]).toBeUndefined();
    expect(graph.path?.boxes.map((box) => box.id)).toEqual(ids("a", "q", "z"));
  });

  it("keeps a pinned former route box as a plain box with the data it had", () => {
    const base = withExpandedM();
    const current: GraphState = { ...base, pinned: [id("m")] };
    const answer = pathAnswer(current, viaQ(), EXPAND_M);
    const { graph } = rebuildPathGraph(current, answer, GAP);
    expect(graph.nodes[id("m")]).toEqual(current.nodes[id("m")]);
    expect(graph.positions[id("m")]).toEqual(current.positions[id("m")]);
    expect(graph.pinned).toEqual([id("m")]);
    const links = Object.values(graph.edges).filter(
      (edge) => edge.from === id("m") || edge.to === id("m"),
    );
    expect(links).toEqual([]);
    expect(Object.hasOwn(graph.slices, id("m"))).toBe(false);
    expect(Object.hasOwn(graph.nodes, id("mm"))).toBe(false);
    expect(graph.path?.boxes.some((box) => box.id === id("m"))).toBe(false);
  });

  it("removes a vanished neighbour of A even when it is pinned", () => {
    const base = placed(pathGraph());
    const current: GraphState = { ...base, pinned: [id("s")] };
    const parts = partsOf(sliceOf("a", [], ["m"]), routeOf(["a", "m", "z"]));
    const answer = pathAnswer(current, parts);
    const { graph } = rebuildPathGraph(current, answer, GAP);
    expect(Object.hasOwn(graph.nodes, id("s"))).toBe(false);
    expect(graph.pinned).toEqual([]);
    expect(graph.positions[id("s")]).toBeUndefined();
  });

  it("keeps the expansion of a route box that stays on a route", () => {
    const current = withExpandedM();
    const answer = pathAnswer(current, sameRoute(), EXPAND_M);
    const { graph, added } = rebuildPathGraph(current, answer, GAP);
    expect(Object.hasOwn(graph.nodes, id("mm"))).toBe(true);
    expect(graph.slices[id("m")]?.members).toEqual(ids("mm"));
    expect(graph.positions[id("mm")]).toEqual(current.positions[id("mm")]);
    expect(added).toEqual([]);
  });

  it("drops the expansion of a box that left the route with it", () => {
    const current = withExpandedM();
    const answer = pathAnswer(current, viaQ(), EXPAND_M);
    const { graph } = rebuildPathGraph(current, answer, GAP);
    expect(Object.hasOwn(graph.nodes, id("m"))).toBe(false);
    expect(Object.hasOwn(graph.nodes, id("mm"))).toBe(false);
    expect(Object.hasOwn(graph.slices, id("m"))).toBe(false);
  });
});

describe("rebuildPathGraph around the rest of the graph", () => {
  it("sets the path before the hidden set, so a test B is not hidden", () => {
    const current = placed(pathGraph());
    const parts = {
      ...sameRoute(),
      route: routeOf(["a", "m", "z"], { z: { isTest: true } }),
    };
    const { graph } = rebuildPathGraph(
      current,
      pathAnswer(current, parts),
      GAP,
      "hide",
    );
    expect(graph.positions[id("z")]).toEqual(current.positions[id("z")]);
    expect(graph.open).toContain(id("z"));
  });

  it("places new boxes clear of everything at every gap", () => {
    for (const gap of [32, 192, 480]) {
      const pitch = 320 + gap;
      const current = placed(pathGraph(), {}, pitch);
      const route: PathRoute = {
        nodes: ["a", "m", "n", "z"].map((name) => makeNode({ id: id(name) })),
        edges: [
          makeEdge(id("a"), id("m")),
          makeEdge(id("m"), id("n")),
          makeEdge(id("n"), id("z")),
        ],
      };
      const parts = partsOf(sliceOf("a", ["s", "t"], ["m"]), route);
      const { graph } = rebuildPathGraph(
        current,
        pathAnswer(current, parts),
        gap,
      );
      const placedIds = Object.keys(graph.positions);
      expect(placedIds).toHaveLength(6);
      for (const [at, one] of placedIds.entries()) {
        for (const other of placedIds.slice(at + 1)) {
          const clear = isClear(
            rectOf(graph, one),
            rectOf(graph, other),
            rowGap(gap),
          );
          expect(clear, `${one} and ${other} at gap ${gap}`).toBe(true);
        }
      }
    }
  });

  it("leaves A's slice record as A's ordinary slice", () => {
    const current = placed(pathGraph());
    const parts = sameRoute();
    const answer = pathAnswer(current, parts);
    const { graph } = rebuildPathGraph(current, answer, GAP);
    expect(Object.keys(graph.slices)).toEqual([id("a")]);
    expect(graph.slices[id("a")]).toEqual({
      members: ids("s", "m"),
      edgeIds: parts.slice.edges.map((edge) => edge.id),
    });
  });

  it("keeps generation, project, focus and gap, and takes sourceVersion from the answer", () => {
    const base = placed(pathGraph());
    const current: GraphState = {
      ...base,
      generation: 3,
      columnGap: 480,
      sourceVersion: 1,
    };
    const answer = pathAnswer(current, sameRoute(), [], 12);
    const { graph } = rebuildPathGraph(current, answer, 32);
    expect(graph).toMatchObject({
      generation: 3,
      project: current.project,
      focusId: id("a"),
      columnGap: 480,
      sourceVersion: 12,
      revision: current.revision + 1,
    });
  });
});
