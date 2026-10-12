import { describe, expect, it } from "vitest";
import {
  doubleClickAction,
  justUnpinned,
  nodeControl,
  UNPIN_GUARD_MS,
  type NodeUi,
} from "../../../src/graph/nodes/node-controls.js";
import {
  graphFromSlice,
  mergeExpansion,
} from "../../../src/view/graph-state.js";
import { graphOf, id, PROJECT, sliceOf } from "../../support/graph-states.js";
import { makeNode, makeSlice } from "../../support/slices.js";

const idle: NodeUi = { busy: false, loading: [], refreshing: false };
const ui = (patch: Partial<NodeUi>): NodeUi => ({ ...idle, ...patch });

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
    expect(nodeControl(fn, graph, ui({ busy: true }))).toBe("expandDisabled");
    const withComponent = withKinds();
    expect(
      nodeControl(withComponent.nodes["src/a.ts#C"]!, withComponent, idle),
    ).toBe("expand");
  });

  it("shows loading for a loading box, busy or not", () => {
    const graph = graphOf("a", ["b"]);
    const fn = graph.nodes[id("b")]!;
    const loading = [id("b")];
    expect(nodeControl(fn, graph, ui({ loading }))).toBe("loading");
    expect(nodeControl(fn, graph, ui({ busy: true, loading }))).toBe("loading");
  });

  it("offers collapse on an expanded box, also while busy", () => {
    const graph = mergeExpansion(
      graphOf("a", ["b"]),
      id("b"),
      sliceOf("b", ["d"]),
    ).graph;
    const fn = graph.nodes[id("b")]!;
    expect(nodeControl(fn, graph, idle)).toBe("collapse");
    expect(nodeControl(fn, graph, ui({ busy: true }))).toBe("collapse");
  });

  it("prefers loading over collapse when an expanded box is loading again", () => {
    const graph = mergeExpansion(
      graphOf("a", ["b"]),
      id("b"),
      sliceOf("b", ["d"]),
    ).graph;
    const fn = graph.nodes[id("b")]!;
    expect(nodeControl(fn, graph, ui({ loading: [id("b")] }))).toBe("loading");
  });

  it("never treats the centre as expanded although its slice is recorded", () => {
    const graph = graphOf("a", ["b"]);
    expect(graph.slices[id("a")]).toBeDefined();
    expect(nodeControl(graph.nodes[id("a")]!, graph, idle)).toBe("none");
    expect(
      nodeControl(graph.nodes[id("a")]!, graph, ui({ loading: [id("a")] })),
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
      doubleClickAction(graph.nodes[id("b")]!, graph, ui({ busy: true })),
    ).toBe("none");
  });

  it("does nothing while the box is loading, expanded or not", () => {
    const graph = graphOf("a", ["b"]);
    const loading = ui({ loading: [id("b")] });
    expect(doubleClickAction(graph.nodes[id("b")]!, graph, loading)).toBe(
      "none",
    );
    const open = expanded();
    expect(doubleClickAction(open.nodes[id("b")]!, open, loading)).toBe(
      "none",
    );
  });

  it("collapses an expanded box, also while busy", () => {
    const graph = expanded();
    const fn = graph.nodes[id("b")]!;
    expect(doubleClickAction(fn, graph, idle)).toBe("collapse");
    expect(doubleClickAction(fn, graph, ui({ busy: true }))).toBe("collapse");
  });

  it("does nothing on the centre or on external, unknown and module boxes", () => {
    const graph = withKinds();
    for (const node of Object.values(graph.nodes)) {
      if (node.id === "src/a.ts#C") continue;
      expect(doubleClickAction(node, graph, idle)).toBe("none");
    }
  });
});

describe("while refreshing", () => {
  const refreshing = ui({ refreshing: true });
  const open = () =>
    mergeExpansion(graphOf("a", ["b"]), id("b"), sliceOf("b", ["d"])).graph;

  it("disables expand on a collapsed function or component", () => {
    const graph = graphOf("a", ["b"]);
    expect(nodeControl(graph.nodes[id("b")]!, graph, refreshing)).toBe(
      "expandDisabled",
    );
    const kinds = withKinds();
    expect(nodeControl(kinds.nodes["src/a.ts#C"]!, kinds, refreshing)).toBe(
      "expandDisabled",
    );
  });

  it("disables collapse on an expanded box", () => {
    const graph = open();
    expect(nodeControl(graph.nodes[id("b")]!, graph, refreshing)).toBe(
      "collapseDisabled",
    );
  });

  it("keeps none for the centre and loading for a loading box", () => {
    const graph = open();
    expect(nodeControl(graph.nodes[id("a")]!, graph, refreshing)).toBe("none");
    const loading = ui({ refreshing: true, loading: [id("b")] });
    expect(nodeControl(graph.nodes[id("b")]!, graph, loading)).toBe("loading");
  });

  it("makes a double-click do nothing on either kind of box", () => {
    const collapsed = graphOf("a", ["b"]);
    expect(
      doubleClickAction(collapsed.nodes[id("b")]!, collapsed, refreshing),
    ).toBe("none");
    const graph = open();
    expect(doubleClickAction(graph.nodes[id("b")]!, graph, refreshing)).toBe(
      "none",
    );
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
