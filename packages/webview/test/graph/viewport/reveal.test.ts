import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../../../src/graph/constants.js";
import { nodeHeight } from "../../../src/graph/nodes/node-size.js";
import { revealRect } from "../../../src/graph/viewport/reveal.js";
import { graphFromSlice } from "../../../src/view/graph-state.js";
import { id, PROJECT, sliceOf } from "../../support/graph-states.js";

const graph = graphFromSlice(sliceOf("a", ["b", "c"]), PROJECT, {
  [id("a")]: { x: 0, y: 0 },
  [id("b")]: { x: 100, y: 50 },
  [id("c")]: { x: -200, y: 300 },
});

describe("revealRect", () => {
  it("spans the added nodes by position and analytic height", () => {
    const height = nodeHeight(graph.nodes[id("c")]!, false);
    expect(revealRect(graph, [id("b"), id("c")])).toEqual({
      x: -200,
      y: 50,
      width: 100 + NODE_WIDTH - -200,
      height: 300 + height - 50,
    });
  });

  it("ignores ids without a node or position, and no ids gives undefined", () => {
    const partial = { ...graph, positions: { [id("b")]: { x: 5, y: 6 } } };
    expect(revealRect(partial, [id("b"), id("c"), "src/a.ts#gone"])).toEqual({
      x: 5,
      y: 6,
      width: NODE_WIDTH,
      height: nodeHeight(graph.nodes[id("b")]!, false),
    });
    expect(revealRect(graph, [])).toBeUndefined();
    expect(revealRect(graph, ["src/a.ts#gone"])).toBeUndefined();
  });

  it("counts an open box at its full height in the revealed rectangle", () => {
    const open = { ...graph, open: [id("c")] };
    const full = nodeHeight(open.nodes[id("c")]!, true);
    expect(full).toBeGreaterThan(nodeHeight(open.nodes[id("c")]!, false));
    expect(revealRect(open, [id("b"), id("c")])).toEqual({
      x: -200,
      y: 50,
      width: 100 + NODE_WIDTH - -200,
      height: 300 + full - 50,
    });
  });
});
