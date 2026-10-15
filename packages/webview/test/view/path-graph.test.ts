import { describe, expect, it } from "vitest";
import { graphFromSlice } from "../../src/view/graph-state.js";
import { withRoute } from "../../src/view/path-graph.js";
import { id, PROJECT } from "../support/graph-states.js";
import { pathGraph, pathParts, routeOf } from "../support/path-graphs.js";
import { makeNode } from "../support/slices.js";

describe("graphFromPath", () => {
  it("merges A's neighbourhood and the route into one graph with A open", () => {
    const graph = pathGraph();
    expect(Object.keys(graph.nodes).sort()).toEqual(
      ["a", "m", "s", "z"].map(id).sort(),
    );
    expect(graph.focusId).toBe(id("a"));
    expect(graph.project).toBe(PROJECT);
    expect(graph.open).toContain(id("a"));
    expect(graph.positions).toEqual({});
  });

  it("makes a box in both one node and a link in both one edge", () => {
    const graph = pathGraph();
    const link = (from: string, to: string) => `${id(from)}->${id(to)}`;
    expect(Object.keys(graph.edges).sort()).toEqual(
      [link("s", "a"), link("a", "m"), link("m", "z")].sort(),
    );
    const dangling = routeOf(["a", "q"]);
    const lonely = withRoute(
      graphFromSlice(pathParts().slice, PROJECT),
      { nodes: [], edges: dangling.edges },
      pathParts().path,
      false,
    );
    expect(Object.keys(lonely.edges)).not.toContain(link("a", "q"));
  });

  it("keeps the data of an id already in the neighbourhood", () => {
    const graph = pathGraph();
    expect(graph.nodes[id("m")]?.name).toBe("slice m");
    expect(graph.nodes[id("z")]?.name).toBe("z");
    const replaced = withRoute(
      graph,
      { nodes: [makeNode({ id: id("m"), name: "new m" })], edges: [] },
      pathParts().path,
      true,
    );
    expect(replaced.nodes[id("m")]?.name).toBe("new m");
  });

  it("opens B when it has a code region and starts the other boxes closed", () => {
    const parts = pathParts();
    expect([...(pathGraph(parts).open ?? [])].sort()).toEqual(
      [id("a"), id("z")].sort(),
    );
    const chip = {
      ...parts,
      route: routeOf(["a", "m", "z"], { z: { codePreview: "" } }),
    };
    expect(pathGraph(chip).open).toEqual([id("a")]);
  });

  it("leaves A's slice record as A's ordinary slice and sets path", () => {
    const parts = pathParts();
    const graph = pathGraph(parts);
    const ordinary = graphFromSlice(parts.slice, PROJECT);
    expect(graph.slices).toEqual(ordinary.slices);
    expect(Object.keys(graph.slices)).toEqual([id("a")]);
    expect(graph.path).toBe(parts.path);
    const more = withRoute(ordinary, parts.route, parts.path, false);
    expect(more.slices).toBe(ordinary.slices);
    expect(more.revision).toBe(ordinary.revision + 1);
  });
});
