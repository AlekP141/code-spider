import { describe, expect, it } from "vitest";
import {
  collapseNode,
  graphFromSlice,
  isOpen,
  mergeExpansion,
  pinNodes,
} from "../../src/view/graph-state.js";
import {
  graphOf,
  id,
  nodeIds,
  PROJECT,
  sliceOf,
  tweakNode,
} from "../support/graph-states.js";

describe("graphFromSlice and open", () => {
  it("lists only the centre in open", () => {
    const graph = graphOf("a", ["b"], ["c"]);
    expect(graph.open).toEqual([id("a")]);
  });

  it("leaves open empty when the centre has no code region", () => {
    const slice = tweakNode(sliceOf("a", ["b"]), "a", { codePreview: "" });
    const graph = graphFromSlice(slice, PROJECT);
    expect(graph.open).toEqual([]);
  });
});

describe("isOpen", () => {
  it("is true for a listed box, false for others and false when open is absent", () => {
    const graph = { ...graphOf("a", ["b"]), open: [id("a")] };
    expect(isOpen(graph, id("a"))).toBe(true);
    expect(isOpen(graph, id("b"))).toBe(false);
    expect(isOpen(graph, id("missing"))).toBe(false);
    const { open: _omitted, ...older } = graph;
    expect(isOpen(older, id("a"))).toBe(false);
  });
});

describe("mergeExpansion and open", () => {
  it("keeps open and the boxes it adds are not open", () => {
    const base = graphOf("a", ["b"]);
    const merged = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    ).graph;
    expect(nodeIds(merged)).toContain(id("d"));
    expect(merged.open).toEqual([id("a")]);
    expect(isOpen(merged, id("d"))).toBe(false);
  });
});

describe("collapseNode and open", () => {
  function expandedB() {
    const base = graphOf("a", ["b"]);
    return mergeExpansion(base, id("b"), sliceOf("b", ["d", "e"], ["a"]))
      .graph;
  }

  it("drops the boxes it removes from open and keeps the others", () => {
    const graph = {
      ...expandedB(),
      open: [id("a"), id("b"), id("d"), id("e")],
    };
    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b")]);
    expect(collapsed.open).toEqual([id("a"), id("b")]);
  });

  it("keeps the open state of a pinned box that stays as a lone box", () => {
    const pinned = pinNodes(expandedB(), { [id("d")]: { x: 40, y: 50 } });
    const graph = { ...pinned, open: [id("a"), id("d"), id("e")] };
    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b"), id("d")]);
    expect(collapsed.open).toEqual([id("a"), id("d")]);
  });

  it("leaves an absent open absent", () => {
    const { open: _omitted, ...older } = expandedB();
    const collapsed = collapseNode(older, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b")]);
    expect(collapsed).not.toHaveProperty("open");
  });
});
