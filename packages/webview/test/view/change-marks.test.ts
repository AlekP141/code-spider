import { describe, expect, it } from "vitest";
import { withChangeMarks } from "../../src/view/change-marks.js";
import type { GraphState } from "../../src/view/types.js";
import { graphOf, id, openAll } from "../support/graph-states.js";

function marked(graph: GraphState, name: string, change: "added" | "modified") {
  const node = graph.nodes[id(name)];
  if (!node) throw new Error(`no ${name}`);
  return {
    ...graph,
    nodes: { ...graph.nodes, [id(name)]: { ...node, change } },
  };
}

const changeOf = (graph: GraphState, name: string) =>
  graph.nodes[id(name)]?.change;

describe("withChangeMarks", () => {
  it("sets a mark on a node that has none", () => {
    const graph = graphOf("a", ["s"]);
    const next = withChangeMarks(graph, { [id("s")]: "added" });
    expect(changeOf(next, "s")).toBe("added");
    expect(changeOf(next, "a")).toBeUndefined();
  });

  it("replaces a different mark", () => {
    const graph = marked(graphOf("a", ["s"]), "s", "added");
    const next = withChangeMarks(graph, { [id("s")]: "modified" });
    expect(changeOf(next, "s")).toBe("modified");
  });

  it("removes the mark of a node the marks do not list", () => {
    const graph = marked(graphOf("a", ["s"]), "s", "modified");
    const next = withChangeMarks(graph, {});
    expect(Object.hasOwn(next.nodes[id("s")] ?? {}, "change")).toBe(false);
    expect(next.nodes[id("a")]).toBe(graph.nodes[id("a")]);
  });

  it("returns the very same graph when nothing differs", () => {
    const plain = graphOf("a", ["s"]);
    expect(withChangeMarks(plain, {})).toBe(plain);
    const graph = marked(plain, "s", "added");
    expect(withChangeMarks(graph, { [id("s")]: "added" })).toBe(graph);
    expect(
      withChangeMarks(graph, { [id("zz")]: "added", [id("s")]: "added" }),
    ).toBe(graph);
  });

  it("leaves positions, pins, open, edges, slices and revision as they were", () => {
    const base = openAll(graphOf("a", ["s"], ["c"]));
    const graph: GraphState = {
      ...base,
      positions: { [id("a")]: { x: 1, y: 2 } },
      pinned: [id("a")],
      revision: 7,
    };
    const next = withChangeMarks(graph, { [id("c")]: "modified" });
    expect(next).not.toBe(graph);
    expect(next.positions).toBe(graph.positions);
    expect(next.pinned).toBe(graph.pinned);
    expect(next.open).toBe(graph.open);
    expect(next.edges).toBe(graph.edges);
    expect(next.slices).toBe(graph.slices);
    expect(next.revision).toBe(7);
    expect(next.generation).toBe(graph.generation);
  });
});
