import { describe, expect, it } from "vitest";
import {
  forgetHidden,
  hiddenIds,
  visibleGraph,
} from "../../src/view/test-visibility.js";
import type { GraphState } from "../../src/view/types.js";
import { id, nodeIds } from "../support/graph-states.js";
import { linkedGraph } from "../support/hidden-graphs.js";

const names = (ids: ReadonlySet<string>) => [...ids].sort();

function withTestCentre(graph: GraphState): GraphState {
  const centre = graph.nodes[graph.focusId];
  if (!centre) throw new Error("no centre");
  return {
    ...graph,
    nodes: { ...graph.nodes, [centre.id]: { ...centre, isTest: true } },
  };
}

describe("hiddenIds and visibleGraph", () => {
  it("hides nothing when showing, and visibleGraph then returns the very same graph", () => {
    const graph = linkedGraph({
      focus: "a",
      tests: ["t"],
      links: [["a", "t"]],
    });
    const hidden = hiddenIds(graph, "show");
    expect(hidden.size).toBe(0);
    expect(visibleGraph(graph, hidden)).toBe(graph);
  });

  it("hides every test box except the centre", () => {
    const graph = linkedGraph({
      focus: "a",
      plain: ["p"],
      tests: ["t1", "t2"],
      links: [
        ["a", "p"],
        ["a", "t1"],
        ["p", "t2"],
      ],
    });
    expect(names(hiddenIds(graph, "hide"))).toEqual([id("t1"), id("t2")]);
  });

  it("keeps a test centre visible, and its non-test neighbours through it", () => {
    const graph = withTestCentre(
      linkedGraph({
        focus: "a",
        plain: ["p", "q"],
        tests: ["t"],
        links: [
          ["a", "p"],
          ["p", "q"],
          ["a", "t"],
        ],
      }),
    );
    expect(names(hiddenIds(graph, "hide"))).toEqual([id("t")]);
  });

  it("hides a box that is reached only through a test box", () => {
    const graph = linkedGraph({
      focus: "a",
      plain: ["x", "y"],
      tests: ["t"],
      links: [
        ["a", "t"],
        ["t", "x"],
        ["x", "y"],
      ],
    });
    expect(names(hiddenIds(graph, "hide"))).toEqual(
      [id("t"), id("x"), id("y")].sort(),
    );
  });

  it("keeps a box that has a path through visible boxes although a test box also reaches it", () => {
    const graph = linkedGraph({
      focus: "a",
      plain: ["p", "x"],
      tests: ["t"],
      links: [
        ["a", "p"],
        ["p", "x"],
        ["a", "t"],
        ["t", "x"],
      ],
    });
    expect(names(hiddenIds(graph, "hide"))).toEqual([id("t")]);
  });

  it("counts a path in either direction of an edge", () => {
    const graph = linkedGraph({
      focus: "a",
      plain: ["p", "x"],
      tests: ["t"],
      links: [
        ["p", "a"],
        ["p", "x"],
        ["a", "t"],
      ],
    });
    expect(names(hiddenIds(graph, "hide"))).toEqual([id("t")]);
  });

  it("drops hidden boxes with their edges and any leftover data and changes nothing else", () => {
    const graph = {
      ...linkedGraph({
        focus: "a",
        plain: ["p"],
        tests: ["t"],
        links: [
          ["a", "p"],
          ["a", "t"],
        ],
        positions: {
          [id("a")]: { x: 0, y: 0 },
          [id("p")]: { x: 512, y: 0 },
          [id("t")]: { x: 1024, y: 0 },
        },
      }),
      pinned: [id("p"), id("t")],
      open: [id("a"), id("t")],
    };
    const shown = visibleGraph(graph, hiddenIds(graph, "hide"));
    expect(nodeIds(shown)).toEqual([id("a"), id("p")]);
    expect(Object.values(shown.edges).map((edge) => edge.to)).toEqual([
      id("p"),
    ]);
    expect(Object.keys(shown.positions).sort()).toEqual([id("a"), id("p")]);
    expect(shown.pinned).toEqual([id("p")]);
    expect(shown.open).toEqual([id("a")]);
    expect({
      ...shown,
      nodes: graph.nodes,
      edges: graph.edges,
      positions: graph.positions,
      pinned: graph.pinned,
      open: graph.open,
    }).toEqual(graph);
    expect(shown.slices).toBe(graph.slices);
  });

  it("comes back as the very same graph when hiding a graph with no test box", () => {
    const graph = linkedGraph({
      focus: "a",
      plain: ["p"],
      links: [["a", "p"]],
    });
    const hidden = hiddenIds(graph, "hide");
    expect(hidden.size).toBe(0);
    expect(visibleGraph(graph, hidden)).toBe(graph);
    expect(forgetHidden(graph, "hide")).toBe(graph);
  });
});

describe("forgetHidden", () => {
  const placed = () => ({
    ...linkedGraph({
      focus: "a",
      plain: ["p"],
      tests: ["t"],
      links: [
        ["a", "p"],
        ["a", "t"],
      ],
      positions: {
        [id("a")]: { x: 0, y: 0 },
        [id("p")]: { x: 512, y: 0 },
        [id("t")]: { x: 1024, y: 0 },
      },
    }),
    pinned: [id("p"), id("t")],
    open: [id("a"), id("t")],
  });

  it("drops the position, pin and open entry of hidden boxes, keeps their nodes, edges and slices, and raises revision", () => {
    const graph = placed();
    const forgotten = forgetHidden(graph, "hide");
    expect(Object.keys(forgotten.positions).sort()).toEqual([id("a"), id("p")]);
    expect(forgotten.pinned).toEqual([id("p")]);
    expect(forgotten.open).toEqual([id("a")]);
    expect(forgotten.nodes).toBe(graph.nodes);
    expect(forgotten.edges).toBe(graph.edges);
    expect(forgotten.slices).toBe(graph.slices);
    expect(forgotten.revision).toBe(graph.revision + 1);
    const noOpen: GraphState = placed();
    delete noOpen.open;
    expect("open" in forgetHidden(noOpen, "hide")).toBe(false);
  });

  it("returns the very same graph when no hidden box has any of them, and when showing", () => {
    const graph = placed();
    const forgotten = forgetHidden(graph, "hide");
    expect(forgetHidden(forgotten, "hide")).toBe(forgotten);
    expect(forgetHidden(graph, "show")).toBe(graph);
  });
});
