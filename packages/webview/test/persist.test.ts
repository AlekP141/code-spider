import { describe, expect, it } from "vitest";
import { isGraphState, isViewState } from "../src/view/persist.js";
import { mergeExpansion, pinNodes } from "../src/view/graph-state.js";
import { commitCentre, createView } from "../src/view/view-state.js";
import { graphOf, id, sliceOf } from "./support/graph-states.js";

function populatedView() {
  let view = commitCentre(createView(), graphOf("a", ["b"], ["c"]));
  const base = view.current;
  if (!base) throw new Error("no graph");
  const expanded = mergeExpansion(base, id("b"), sliceOf("b", ["d"], ["a"]));
  view = commitCentre(
    view,
    pinNodes(expanded.graph, { [id("d")]: { x: 1, y: 2 } }),
  );
  return commitCentre(view, graphOf("c", ["a"]));
}

describe("isViewState", () => {
  it("accepts a fresh view and one with a graph and history", () => {
    expect(isViewState(createView())).toBe(true);
    expect(isViewState(populatedView())).toBe(true);
  });

  it("accepts what survives a trip through JSON, which drops undefined", () => {
    const empty = JSON.parse(JSON.stringify(createView())) as unknown;
    const populated = JSON.parse(JSON.stringify(populatedView())) as unknown;
    expect(isViewState(empty)).toBe(true);
    expect(isViewState(populated)).toBe(true);
  });

  it("rejects values that are not a view state", () => {
    for (const value of [undefined, null, 3, "x", [], {}]) {
      expect(isViewState(value)).toBe(false);
    }
  });

  it("rejects another version or a wrong field type", () => {
    const view = createView();
    expect(isViewState({ ...view, version: 2 })).toBe(false);
    expect(isViewState({ ...view, nextGeneration: "1" })).toBe(false);
    expect(isViewState({ ...view, columnGap: Number.NaN })).toBe(false);
    expect(isViewState({ ...view, history: "none" })).toBe(false);
  });

  it("rejects a view whose current graph is malformed", () => {
    expect(isViewState({ ...createView(), current: { focusId: "x" } })).toBe(
      false,
    );
  });

  it("rejects a generation counter that is not ahead of every graph", () => {
    const populated = populatedView();
    const generation = populated.current?.generation ?? 0;
    expect(isViewState({ ...populated, nextGeneration: 0 })).toBe(false);
    expect(isViewState({ ...populated, nextGeneration: generation })).toBe(
      false,
    );
    expect(isViewState({ ...populated, nextGeneration: 1.5 })).toBe(false);
    const oldest = populated.history[0]?.generation ?? 0;
    const view = { ...populated, current: undefined, nextGeneration: oldest };
    expect(isViewState(view)).toBe(false);
  });

  it("rejects a counter below 1 even with no graphs", () => {
    expect(isViewState({ ...createView(), nextGeneration: 0 })).toBe(false);
  });

  it("rejects a column gap that is not already normalised", () => {
    expect(isViewState({ ...createView(), columnGap: -5000 })).toBe(false);
    expect(isViewState({ ...createView(), columnGap: 100 })).toBe(false);
  });

  it("rejects a history longer than the limit or with a broken graph", () => {
    const populated = populatedView();
    const graph = populated.current;
    expect(isViewState({ ...populated, history: Array(21).fill(graph) })).toBe(
      false,
    );
    expect(isViewState({ ...populated, history: [{ focusId: "x" }] })).toBe(
      false,
    );
  });
});

describe("isGraphState", () => {
  const graph = graphOf("a", ["b"], ["c"]);

  it("accepts a built graph", () => {
    expect(isGraphState(graph)).toBe(true);
  });

  it("rejects a graph whose centre is missing or whose parts are malformed", () => {
    expect(isGraphState({ ...graph, focusId: id("gone") })).toBe(false);
    expect(isGraphState({ ...graph, nodes: [] })).toBe(false);
    expect(isGraphState({ ...graph, nodes: { [id("a")]: { id: 3 } } })).toBe(
      false,
    );
    expect(isGraphState({ ...graph, edges: { e: { id: "e" } } })).toBe(false);
    expect(isGraphState({ ...graph, slices: { a: { members: [1] } } })).toBe(
      false,
    );
    expect(isGraphState({ ...graph, positions: { a: { x: 1 } } })).toBe(false);
    expect(isGraphState({ ...graph, pinned: [1] })).toBe(false);
    expect(isGraphState({ ...graph, revision: undefined })).toBe(false);
    expect(isGraphState({ ...graph, project: 5 })).toBe(false);
    expect(isGraphState({ ...graph, generation: "1" })).toBe(false);
  });

  it("accepts a missing or numeric sourceVersion and rejects the rest", () => {
    expect(isGraphState({ ...graph, sourceVersion: undefined })).toBe(true);
    expect(isGraphState({ ...graph, sourceVersion: 0 })).toBe(true);
    expect(isGraphState({ ...graph, sourceVersion: 7 })).toBe(true);
    expect(isGraphState({ ...graph, sourceVersion: "7" })).toBe(false);
    expect(isGraphState({ ...graph, sourceVersion: Number.NaN })).toBe(false);
    expect(isGraphState({ ...graph, sourceVersion: Infinity })).toBe(false);
  });

  it("checks sourceVersion on the current graph and on history", () => {
    const view = commitCentre(createView(), graphOf("a", ["b"]));
    const current = view.current;
    if (!current) throw new Error("no graph");
    const good = { ...current, sourceVersion: 4 };
    const bad = { ...current, sourceVersion: Number.NaN };
    expect(isViewState({ ...view, current: good })).toBe(true);
    expect(isViewState({ ...view, current: bad })).toBe(false);
    expect(isViewState({ ...view, current: undefined, history: [good] })).toBe(
      true,
    );
    expect(isViewState({ ...view, current: undefined, history: [bad] })).toBe(
      false,
    );
    const stringy = { ...current, sourceVersion: "4" };
    expect(isViewState({ ...view, history: [stringy] })).toBe(false);
  });

  it("rejects nodes with a wrong kind, range or flag", () => {
    const node = graph.nodes[id("a")];
    for (const broken of [
      { ...node, kind: "klass" },
      { ...node, range: {} },
      { ...node, isAsync: "no" },
      { ...node, inputType: undefined },
      { ...node, returnType: 3 },
    ]) {
      const nodes = { ...graph.nodes, [id("a")]: broken };
      expect(isGraphState({ ...graph, nodes })).toBe(false);
    }
  });

  it("rejects edges with a wrong kind or call site", () => {
    const key = `${id("b")}->${id("a")}`;
    const edge = graph.edges[key];
    for (const broken of [
      { ...edge, kind: "spawn" },
      { ...edge, callSite: {} },
      { ...edge, callSite: undefined },
    ]) {
      const edges = { ...graph.edges, [key]: broken };
      expect(isGraphState({ ...graph, edges })).toBe(false);
    }
  });

  it("rejects an edge that points at a node the graph does not have", () => {
    const key = `${id("b")}->${id("a")}`;
    const edge = graph.edges[key];
    for (const broken of [
      { ...edge, from: id("gone") },
      { ...edge, to: id("gone") },
    ]) {
      const edges = { ...graph.edges, [key]: broken };
      expect(isGraphState({ ...graph, edges })).toBe(false);
    }
  });

  it("rejects a node or edge stored under another key", () => {
    const edgeKey = `${id("b")}->${id("a")}`;
    expect(
      isGraphState({
        ...graph,
        nodes: { ...graph.nodes, [id("b")]: graph.nodes[id("c")] },
      }),
    ).toBe(false);
    const other = graph.edges[`${id("a")}->${id("c")}`];
    const edges = { ...graph.edges, [edgeKey]: other };
    expect(isGraphState({ ...graph, edges })).toBe(false);
  });

  it("rejects slices that point outside the graph or miss the centre", () => {
    const record = graph.slices[id("a")] ?? { members: [], edgeIds: [] };
    expect(isGraphState({ ...graph, slices: {} })).toBe(false);
    expect(
      isGraphState({
        ...graph,
        slices: { ...graph.slices, [id("gone")]: record },
      }),
    ).toBe(false);
    expect(
      isGraphState({
        ...graph,
        slices: {
          [id("a")]: { ...record, members: [...record.members, id("gone")] },
        },
      }),
    ).toBe(false);
    expect(
      isGraphState({
        ...graph,
        slices: { [id("a")]: { ...record, edgeIds: ["gone->gone"] } },
      }),
    ).toBe(false);
  });

  it("rejects a pinned id or a position the graph has no node for", () => {
    expect(isGraphState({ ...graph, pinned: [id("gone")] })).toBe(false);
    expect(
      isGraphState({ ...graph, positions: { [id("gone")]: { x: 1, y: 2 } } }),
    ).toBe(false);
  });

  it("never throws on odd input", () => {
    for (const value of [Object.create(null), { nodes: null }, [[]]]) {
      expect(isGraphState(value)).toBe(false);
      expect(isViewState(value)).toBe(false);
    }
  });
});
