import { describe, expect, it } from "vitest";
import {
  doubleClickAction,
  justUnpinned,
  nodeControl,
  UNPIN_GUARD_MS,
} from "../src/graph/node-controls.js";
import { graphFromSlice, mergeExpansion } from "../src/view/graph-state.js";
import { graphOf, id, PROJECT, sliceOf } from "./support/graph-states.js";
import { makeNode, makeSlice } from "./support/slices.js";

const idle = { busy: false, loading: [] };

function withKinds() {
  const nodes = [
    makeNode({ id: "src/a.ts#centre" }),
    makeNode({ id: "src/a.ts#C", kind: "component" }),
    makeNode({ id: "external:lib#x", kind: "external", file: "" }),
    makeNode({ id: "unknown:a#f#x()", kind: "unknown", file: "" }),
    makeNode({ id: "src/m.ts#<module>", kind: "module" }),
  ];
  return graphFromSlice(makeSlice("src/a.ts#centre", nodes, []), PROJECT);
}

describe("nodeControl", () => {
  it("gives the centre and the external, unknown and module boxes none", () => {
    const graph = withKinds();
    for (const nodeId of Object.keys(graph.nodes)) {
      if (nodeId === "src/a.ts#C") continue;
      expect(nodeControl(graph.nodes[nodeId]!, graph, idle)).toBe("none");
    }
  });

  it("offers expand on a collapsed function or component, disabled while busy", () => {
    const graph = graphOf("a", ["b"]);
    const fn = graph.nodes[id("b")]!;
    expect(nodeControl(fn, graph, idle)).toBe("expand");
    expect(nodeControl(fn, graph, { busy: true, loading: [] })).toBe(
      "expandDisabled",
    );
    const withComponent = withKinds();
    expect(
      nodeControl(withComponent.nodes["src/a.ts#C"]!, withComponent, idle),
    ).toBe("expand");
  });

  it("shows loading for a loading box, busy or not", () => {
    const graph = graphOf("a", ["b"]);
    const fn = graph.nodes[id("b")]!;
    expect(nodeControl(fn, graph, { busy: false, loading: [id("b")] })).toBe(
      "loading",
    );
    expect(nodeControl(fn, graph, { busy: true, loading: [id("b")] })).toBe(
      "loading",
    );
  });

  it("offers collapse on an expanded box, also while busy", () => {
    const graph = mergeExpansion(
      graphOf("a", ["b"]),
      id("b"),
      sliceOf("b", ["d"]),
    ).graph;
    const fn = graph.nodes[id("b")]!;
    expect(nodeControl(fn, graph, idle)).toBe("collapse");
    expect(nodeControl(fn, graph, { busy: true, loading: [] })).toBe(
      "collapse",
    );
  });

  it("prefers loading over collapse when an expanded box is loading again", () => {
    const graph = mergeExpansion(
      graphOf("a", ["b"]),
      id("b"),
      sliceOf("b", ["d"]),
    ).graph;
    const fn = graph.nodes[id("b")]!;
    expect(nodeControl(fn, graph, { busy: false, loading: [id("b")] })).toBe(
      "loading",
    );
  });

  it("never treats the centre as expanded although its slice is recorded", () => {
    const graph = graphOf("a", ["b"]);
    expect(graph.slices[id("a")]).toBeDefined();
    expect(nodeControl(graph.nodes[id("a")]!, graph, idle)).toBe("none");
    expect(
      nodeControl(graph.nodes[id("a")]!, graph, {
        busy: false,
        loading: [id("a")],
      }),
    ).toBe("none");
  });
});

describe("doubleClickAction", () => {
  const expanded = () =>
    mergeExpansion(graphOf("a", ["b"]), id("b"), sliceOf("b", ["d"])).graph;

  it("expands a collapsed function or component", () => {
    const graph = graphOf("a", ["b"]);
    expect(doubleClickAction(graph.nodes[id("b")]!, graph, idle)).toBe(
      "expand",
    );
    const kinds = withKinds();
    expect(doubleClickAction(kinds.nodes["src/a.ts#C"]!, kinds, idle)).toBe(
      "expand",
    );
  });

  it("does nothing on a collapsed box while busy", () => {
    const graph = graphOf("a", ["b"]);
    expect(
      doubleClickAction(graph.nodes[id("b")]!, graph, {
        busy: true,
        loading: [],
      }),
    ).toBe("none");
  });

  it("does nothing while the box is loading, expanded or not", () => {
    const graph = graphOf("a", ["b"]);
    const ui = { busy: false, loading: [id("b")] };
    expect(doubleClickAction(graph.nodes[id("b")]!, graph, ui)).toBe("none");
    const open = expanded();
    expect(doubleClickAction(open.nodes[id("b")]!, open, ui)).toBe("none");
  });

  it("collapses an expanded box, also while busy", () => {
    const graph = expanded();
    const fn = graph.nodes[id("b")]!;
    expect(doubleClickAction(fn, graph, idle)).toBe("collapse");
    expect(doubleClickAction(fn, graph, { busy: true, loading: [] })).toBe(
      "collapse",
    );
  });

  it("does nothing on the centre or on external, unknown and module boxes", () => {
    const graph = withKinds();
    for (const node of Object.values(graph.nodes)) {
      if (node.id === "src/a.ts#C") continue;
      expect(doubleClickAction(node, graph, idle)).toBe("none");
    }
  });
});

describe("justUnpinned", () => {
  const last = { nodeId: id("b"), at: 1000 };

  it("is false with no last unpin", () => {
    expect(justUnpinned(undefined, id("b"), 1000)).toBe(false);
  });

  it("is true for the same node inside the window", () => {
    expect(justUnpinned(last, id("b"), 1000)).toBe(true);
    expect(justUnpinned(last, id("b"), 1000 + UNPIN_GUARD_MS - 1)).toBe(true);
  });

  it("is false for another node", () => {
    expect(justUnpinned(last, id("c"), 1000)).toBe(false);
  });

  it("is false for the same node once the window has passed", () => {
    expect(justUnpinned(last, id("b"), 1000 + UNPIN_GUARD_MS)).toBe(false);
    expect(justUnpinned(last, id("b"), 1000 + UNPIN_GUARD_MS + 1)).toBe(false);
  });
});
