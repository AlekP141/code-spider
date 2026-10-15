import { describe, expect, it } from "vitest";
import {
  collapseNode,
  collapseRoots,
  mergeExpansion,
  pinNodes,
} from "../../src/view/graph-state.js";
import type { GraphState } from "../../src/view/types.js";
import { id, nodeIds, sliceOf } from "../support/graph-states.js";
import { pathGraph } from "../support/path-graphs.js";

function expanded(graph: GraphState = pathGraph()): GraphState {
  return mergeExpansion(graph, id("s"), sliceOf("s", [], ["q", "r"])).graph;
}

const link = (from: string, to: string) => `${id(from)}->${id(to)}`;

describe("collapse with route boxes as roots", () => {
  it("keeps route boxes that A's slice does not reach when an expansion collapses", () => {
    const graph = expanded();
    const roots = collapseRoots(graph);
    expect(roots[0]).toBe(id("a"));
    expect([...new Set(roots)].sort()).toEqual(["a", "m", "z"].map(id).sort());
    const collapsed = collapseNode(graph, id("s"));
    expect(nodeIds(collapsed)).toEqual(["a", "m", "s", "z"].map(id).sort());
    expect(Object.keys(collapsed.slices)).toEqual([id("a")]);
  });

  it("keeps the edges in path.edgeIds after a collapse and drops the expansion's own", () => {
    const collapsed = collapseNode(expanded(), id("s"));
    expect(Object.keys(collapsed.edges)).toContain(link("m", "z"));
    expect(Object.keys(collapsed.edges)).not.toContain(link("s", "q"));
    expect(Object.keys(collapsed.edges).sort()).toEqual(
      [link("s", "a"), link("a", "m"), link("m", "z")].sort(),
    );
  });

  it("collapses a graph without path exactly as before", () => {
    const { path: _path, ...plain } = pathGraph();
    const graph = expanded(plain as GraphState);
    expect(collapseRoots(graph)).toEqual([id("a")]);
    const collapsed = collapseNode(graph, id("s"));
    expect(nodeIds(collapsed)).toEqual(["a", "m", "s"].map(id).sort());
    expect(Object.keys(collapsed.edges)).not.toContain(link("m", "z"));
  });

  it("keeps a pinned box and removes a box only the collapsed expansion reached", () => {
    const pinned = pinNodes(expanded(), { [id("r")]: { x: 5, y: 6 } });
    const collapsed = collapseNode(pinned, id("s"));
    expect(Object.keys(collapsed.nodes)).toContain(id("r"));
    expect(Object.keys(collapsed.nodes)).not.toContain(id("q"));
    expect(Object.keys(collapsed.nodes)).toContain(id("z"));
    expect(collapsed.positions[id("r")]).toEqual({ x: 5, y: 6 });
  });
});
