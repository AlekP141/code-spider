import { describe, expect, it } from "vitest";
import { graphFromSlice, mergeExpansion } from "../../src/view/graph-state.js";
import { isGraphState } from "../../src/view/persist.js";
import { makeEdge } from "../support/slices.js";
import { graphOf, id, PROJECT, sliceOf } from "../support/graph-states.js";

const dangling = (from: string, to: string) =>
  makeEdge(from, to, { kind: "call" });

describe("a slice edge with an end that is not a node", () => {
  it("is left out of a centre graph, which still passes the structural check", () => {
    const slice = sliceOf("a", ["b"]);
    const withStray = {
      ...slice,
      edges: [
        ...slice.edges,
        dangling(id("a"), id("gone")),
        dangling(id("lost"), id("a")),
      ],
    };
    const graph = graphFromSlice(withStray, PROJECT);
    expect(Object.keys(graph.edges)).toEqual([`${id("b")}->${id("a")}`]);
    expect(graph.slices[id("a")]?.edgeIds).toEqual([`${id("b")}->${id("a")}`]);
    expect(isGraphState(graph)).toBe(true);
  });

  it("is left out of an expansion, which still passes the structural check", () => {
    const base = graphOf("a", ["b"]);
    const slice = sliceOf("b", ["d"], ["a"]);
    const withStray = {
      ...slice,
      edges: [...slice.edges, dangling(id("d"), id("gone"))],
    };
    const { graph } = mergeExpansion(base, id("b"), withStray);
    expect(Object.keys(graph.edges)).not.toContain(`${id("d")}->${id("gone")}`);
    expect(graph.slices[id("b")]?.edgeIds).not.toContain(
      `${id("d")}->${id("gone")}`,
    );
    expect(Object.keys(graph.edges)).toContain(`${id("d")}->${id("b")}`);
    expect(isGraphState(graph)).toBe(true);
  });

  it("is kept in an expansion when the other end is already in the graph", () => {
    const base = graphOf("a", ["b"]);
    const slice = sliceOf("b", ["d"]);
    const link = dangling(id("d"), id("a"));
    const { graph } = mergeExpansion(base, id("b"), {
      ...slice,
      edges: [...slice.edges, link],
    });
    expect(Object.keys(graph.edges)).toContain(link.id);
    expect(graph.slices[id("b")]?.edgeIds).toContain(link.id);
    expect(isGraphState(graph)).toBe(true);
  });
});
