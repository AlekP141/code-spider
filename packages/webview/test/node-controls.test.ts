import { describe, expect, it } from "vitest";
import { canRecentre, nodeControl } from "../src/graph/node-controls.js";
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

describe("canRecentre", () => {
  it("holds only for a function or component that is not the centre", () => {
    const graph = withKinds();
    const holds = Object.values(graph.nodes)
      .filter((node) => canRecentre(node, graph))
      .map((node) => node.id);
    expect(holds).toEqual(["src/a.ts#C"]);
    const plain = graphOf("a", ["b"]);
    expect(canRecentre(plain.nodes[id("b")]!, plain)).toBe(true);
  });
});
