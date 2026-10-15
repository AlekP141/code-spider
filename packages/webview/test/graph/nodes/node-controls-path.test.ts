import { describe, expect, it } from "vitest";
import {
  doubleClickAction,
  nodeControl,
  type NodeUi,
} from "../../../src/graph/nodes/node-controls.js";
import { mergeExpansion } from "../../../src/view/graph-state.js";
import { id, sliceOf } from "../../support/graph-states.js";
import { pathGraph } from "../../support/path-graphs.js";

const idle: NodeUi = { busy: false, loading: [], refreshing: false };

describe("controls on a path graph", () => {
  it("gives A no expand or collapse control and ignores a double-click on it", () => {
    const graph = pathGraph();
    const a = graph.nodes[id("a")]!;
    expect(nodeControl(a, graph, idle)).toBe("none");
    expect(doubleClickAction(a, graph, idle)).toBe("none");
  });

  it("lets B expand and collapse like any box, by control and by double-click", () => {
    const graph = pathGraph();
    const b = graph.nodes[id("z")]!;
    expect(nodeControl(b, graph, idle)).toBe("expand");
    expect(doubleClickAction(b, graph, idle)).toBe("expand");
    const expanded = mergeExpansion(
      graph,
      id("z"),
      sliceOf("z", [], ["q"]),
    ).graph;
    expect(nodeControl(b, expanded, idle)).toBe("collapse");
    expect(doubleClickAction(b, expanded, idle)).toBe("collapse");
  });
});
