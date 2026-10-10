import { describe, expect, it } from "vitest";
import {
  collapseNode,
  graphFromSlice,
  isExpanded,
  mergeExpansion,
  pinNodes,
  setPositions,
  unpinNode,
} from "../src/view/graph-state.js";
import type { GraphState } from "../src/view/types.js";
import {
  edgeIds,
  graphOf,
  id,
  nodeIds,
  PROJECT,
  sliceOf,
} from "./support/graph-states.js";

describe("graphFromSlice", () => {
  it("builds the centre graph and records the centre's slice", () => {
    const graph = graphOf("a", ["b"], ["c"]);
    expect(graph.project).toBe(PROJECT);
    expect(graph.focusId).toBe(id("a"));
    expect(nodeIds(graph)).toEqual([id("a"), id("b"), id("c")]);
    expect(edgeIds(graph)).toEqual([
      `${id("a")}->${id("c")}`,
      `${id("b")}->${id("a")}`,
    ]);
    expect(graph.slices[id("a")]).toEqual({
      members: [id("a"), id("b"), id("c")].filter((node) => node !== id("a")),
      edgeIds: [`${id("b")}->${id("a")}`, `${id("a")}->${id("c")}`],
    });
    expect(graph.pinned).toEqual([]);
    expect(graph.revision).toBe(0);
    expect(isExpanded(graph, id("a"))).toBe(false);
  });

  it("takes the positions it is given", () => {
    const graph = graphFromSlice(sliceOf("a"), PROJECT, {
      [id("a")]: { x: 5, y: 6 },
    });
    expect(graph.positions).toEqual({ [id("a")]: { x: 5, y: 6 } });
  });
});

describe("mergeExpansion", () => {
  it("adds the nodes and edges that are new and records the slice", () => {
    const graph = graphOf("a", ["b"]);
    const { graph: merged, added } = mergeExpansion(
      graph,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    );
    expect(added).toEqual([id("d")]);
    expect(nodeIds(merged)).toEqual([id("a"), id("b"), id("d")]);
    expect(edgeIds(merged)).toEqual([
      `${id("b")}->${id("a")}`,
      `${id("d")}->${id("b")}`,
    ]);
    expect(merged.slices[id("b")]).toEqual({
      members: [id("d"), id("a")],
      edgeIds: [`${id("d")}->${id("b")}`, `${id("b")}->${id("a")}`],
    });
    expect(isExpanded(merged, id("b"))).toBe(true);
    expect(merged.revision).toBe(graph.revision + 1);
  });

  it("is idempotent", () => {
    const slice = sliceOf("b", ["d"], ["a"]);
    const once = mergeExpansion(graphOf("a", ["b"]), id("b"), slice);
    const twice = mergeExpansion(once.graph, id("b"), slice);
    expect(twice.added).toEqual([]);
    expect(twice.graph).toEqual(once.graph);
  });

  it("records the slice and adds a missing edge even when no node is new", () => {
    const graph = graphOf("a", [], ["c"]);
    const { graph: merged, added } = mergeExpansion(
      graph,
      id("c"),
      sliceOf("c", [], ["a"]),
    );
    expect(added).toEqual([]);
    expect(nodeIds(merged)).toEqual(nodeIds(graph));
    expect(edgeIds(merged)).toContain(`${id("c")}->${id("a")}`);
    expect(isExpanded(merged, id("c"))).toBe(true);
  });

  it("leaves the revision alone when nothing was added", () => {
    const graph = graphOf("a", ["b"]);
    const { graph: merged } = mergeExpansion(
      graph,
      id("b"),
      sliceOf("b", [], ["a"]),
    );
    expect(isExpanded(merged, id("b"))).toBe(true);
    expect(merged.revision).toBe(graph.revision);
  });

  it("never replaces or moves a node that is already there", () => {
    const base = graphOf("a", ["b"]);
    const graph = setPositions(base, { [id("a")]: { x: 10, y: 20 } });
    const original = graph.nodes[id("a")];
    const { graph: merged } = mergeExpansion(
      graph,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    );
    expect(merged.nodes[id("a")]).toBe(original);
    expect(merged.positions).toEqual({ [id("a")]: { x: 10, y: 20 } });
  });

  it("does not modify the graph it was given", () => {
    const graph = graphOf("a", ["b"]);
    const snapshot = structuredClone(graph);
    mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"]));
    expect(graph).toEqual(snapshot);
  });
});

describe("collapseNode", () => {
  it("removes only what the expansion brought", () => {
    const base = graphOf("a", ["b"], ["c"]);
    const expanded = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    ).graph;
    const collapsed = collapseNode(expanded, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b"), id("c")]);
    expect(edgeIds(collapsed)).toEqual(edgeIds(base));
    expect(isExpanded(collapsed, id("b"))).toBe(false);
    expect(collapsed.revision).toBe(expanded.revision + 1);
  });

  it("recurses: whatever was expanded only through the node goes with it", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"])).graph;
    graph = mergeExpansion(graph, id("d"), sliceOf("d", ["e"], ["b"])).graph;
    expect(nodeIds(graph)).toEqual([id("a"), id("b"), id("d"), id("e")]);

    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b")]);
    expect(Object.keys(collapsed.slices)).toEqual([id("a")]);
    expect(edgeIds(collapsed)).toEqual([`${id("b")}->${id("a")}`]);
  });

  it("keeps a node the centre's slice also brought in", () => {
    const base = graphOf("a", ["b"], ["c"]);
    const expanded = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", [], ["a", "c"]),
    ).graph;
    expect(edgeIds(expanded)).toContain(`${id("b")}->${id("c")}`);

    const collapsed = collapseNode(expanded, id("b"));
    expect(nodeIds(collapsed)).toContain(id("c"));
    expect(edgeIds(collapsed)).not.toContain(`${id("b")}->${id("c")}`);
  });

  it("keeps a node another expanded node's slice also brought in, until that one collapses too", () => {
    let graph = graphOf("a", ["b"], ["c"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["x"], ["a"])).graph;
    graph = mergeExpansion(graph, id("c"), sliceOf("c", ["x"], ["a"])).graph;

    const withoutB = collapseNode(graph, id("b"));
    expect(nodeIds(withoutB)).toContain(id("x"));
    expect(edgeIds(withoutB)).toContain(`${id("x")}->${id("c")}`);
    expect(edgeIds(withoutB)).not.toContain(`${id("x")}->${id("b")}`);

    const withoutBoth = collapseNode(withoutB, id("c"));
    expect(nodeIds(withoutBoth)).not.toContain(id("x"));
  });

  it("keeps a pinned node as a lone box when it loses all its edges", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"])).graph;
    graph = pinNodes(graph, { [id("d")]: { x: 40, y: 50 } });

    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b"), id("d")]);
    expect(collapsed.pinned).toEqual([id("d")]);
    expect(collapsed.positions[id("d")]).toEqual({ x: 40, y: 50 });
    expect(edgeIds(collapsed)).toEqual([`${id("b")}->${id("a")}`]);
  });

  it("drops the positions of the nodes it removes", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"])).graph;
    graph = setPositions(graph, {
      [id("a")]: { x: 0, y: 0 },
      [id("d")]: { x: -400, y: 0 },
    });
    const collapsed = collapseNode(graph, id("b"));
    expect(Object.keys(collapsed.positions)).toEqual([id("a")]);
  });

  it("terminates on cycles and keeps everything the centre still reaches", () => {
    let graph = graphOf("a", ["b"]);
    graph = mergeExpansion(graph, id("b"), sliceOf("b", ["c"], ["a"])).graph;
    graph = mergeExpansion(graph, id("c"), sliceOf("c", ["a"], ["b"])).graph;
    expect(nodeIds(graph)).toEqual([id("a"), id("b"), id("c")]);

    const collapsed = collapseNode(graph, id("b"));
    expect(nodeIds(collapsed)).toEqual([id("a"), id("b")]);
    expect(Object.keys(collapsed.slices)).toEqual([id("a")]);
  });

  it("changes nothing for the centre or for a node that is not expanded", () => {
    const graph = graphOf("a", ["b"]);
    expect(collapseNode(graph, id("a"))).toBe(graph);
    expect(collapseNode(graph, id("b"))).toBe(graph);
    expect(collapseNode(graph, id("missing"))).toBe(graph);
  });
});

describe("pinNodes, unpinNode and setPositions", () => {
  it("writes the positions, pins each node once and counts a revision", () => {
    const graph = graphOf("a", ["b"]);
    const pinned = pinNodes(graph, {
      [id("a")]: { x: 1, y: 2 },
      [id("b")]: { x: 3, y: 4 },
    });
    expect(pinned.positions).toEqual({
      [id("a")]: { x: 1, y: 2 },
      [id("b")]: { x: 3, y: 4 },
    });
    expect(pinned.pinned).toEqual([id("a"), id("b")]);
    expect(pinned.revision).toBe(graph.revision + 1);

    const again = pinNodes(pinned, { [id("a")]: { x: 9, y: 9 } });
    expect(again.pinned).toEqual([id("a"), id("b")]);
    expect(again.positions[id("a")]).toEqual({ x: 9, y: 9 });
  });

  it("ignores nodes the graph does not have", () => {
    const graph = graphOf("a");
    expect(pinNodes(graph, { [id("gone")]: { x: 1, y: 1 } })).toBe(graph);
    expect(setPositions(graph, { [id("gone")]: { x: 1, y: 1 } })).toBe(graph);
  });

  it("unpins without moving the node", () => {
    const pinned = pinNodes(graphOf("a"), { [id("a")]: { x: 7, y: 8 } });
    const unpinned = unpinNode(pinned, id("a"));
    expect(unpinned.pinned).toEqual([]);
    expect(unpinned.positions[id("a")]).toEqual({ x: 7, y: 8 });
    expect(unpinNode(unpinned, id("a"))).toBe(unpinned);
  });

  it("setPositions moves nodes without pinning them", () => {
    const graph = graphOf("a", ["b"]);
    const moved = setPositions(graph, { [id("b")]: { x: 5, y: 6 } });
    expect(moved.positions).toEqual({ [id("b")]: { x: 5, y: 6 } });
    expect(moved.pinned).toEqual([]);
    expect(moved.revision).toBe(graph.revision + 1);
  });
});

describe("the other functions do not modify the graph they were given", () => {
  function expectUntouched(change: (graph: GraphState) => unknown) {
    const expanded = mergeExpansion(
      graphOf("a", ["b"]),
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    ).graph;
    const graph = pinNodes(expanded, { [id("d")]: { x: 1, y: 2 } });
    const snapshot = structuredClone(graph);
    change(graph);
    expect(graph).toEqual(snapshot);
  }

  it("collapseNode", () => {
    expectUntouched((graph) => collapseNode(graph, id("b")));
  });

  it("pinNodes", () => {
    expectUntouched((graph) => pinNodes(graph, { [id("a")]: { x: 9, y: 9 } }));
  });

  it("unpinNode", () => {
    expectUntouched((graph) => unpinNode(graph, id("d")));
  });

  it("setPositions", () => {
    expectUntouched((graph) =>
      setPositions(graph, { [id("a")]: { x: 9, y: 9 } }),
    );
  });
});
