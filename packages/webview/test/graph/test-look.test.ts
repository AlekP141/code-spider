import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DASHED,
  DOTTED,
  edgeAppearance,
  TEST_DASH,
} from "../../src/graph/edge-appearance.js";
import { NodeBox } from "../../src/graph/nodes/NodeBox.js";
import { toFlow } from "../../src/graph/to-flow.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import { id, PROJECT } from "../support/graph-states.js";
import { makeEdge, makeNode, makeSlice } from "../support/slices.js";

describe("edgeAppearance for test code", () => {
  it("dashes a solid edge touching a test box with TEST_DASH, keeping its width", () => {
    expect(TEST_DASH).toBe("3 3");
    expect(edgeAppearance("call", true, true)).toEqual({
      className: "edge-call edge-test",
      strokeDasharray: TEST_DASH,
      strokeWidth: 1.5,
    });
    expect(edgeAppearance("jsx", true, true)).toMatchObject({
      className: "edge-jsx edge-test",
      strokeDasharray: TEST_DASH,
      strokeWidth: edgeAppearance("jsx", true).strokeWidth,
    });
    expect(edgeAppearance("external", true, true).strokeDasharray).toBe(
      TEST_DASH,
    );
  });

  it("keeps a passes edge dotted and an unresolved edge dashed, both with edge-test", () => {
    expect(edgeAppearance("passes", true, true)).toMatchObject({
      className: "edge-passes edge-test",
      strokeDasharray: DOTTED,
    });
    expect(edgeAppearance("call", false, true)).toMatchObject({
      className: "edge-call edge-unresolved edge-test",
      strokeDasharray: DASHED,
    });
  });

  it("leaves an edge touching no test box unchanged", () => {
    expect(edgeAppearance("call", true, false)).toEqual(
      edgeAppearance("call", true),
    );
    expect(edgeAppearance("call", true).className).toBe("edge-call");
  });
});

describe("toFlow for test code", () => {
  const testNode = makeNode({ id: id("t"), isTest: true });
  const plain = (name: string) => makeNode({ id: id(name) });
  const flow = (
    nodes = [plain("a"), plain("b"), testNode],
    edges = [
      makeEdge(id("a"), id("b")),
      makeEdge(id("b"), id("a")),
      makeEdge(id("t"), id("a")),
      makeEdge(id("a"), id("t")),
    ],
  ) => toFlow(graphFromSlice(makeSlice(id("a"), nodes, edges), PROJECT));

  it("marks an edge when either end is a test box", () => {
    const { edges } = flow();
    const classOf = (from: string, to: string) =>
      edges.find((edge) => edge.id === `${id(from)}->${id(to)}`)?.className;
    expect(classOf("a", "b")).toBe("edge-call");
    expect(classOf("t", "a")).toBe("edge-call edge-test");
    expect(classOf("a", "t")).toBe("edge-call edge-test");
    const dashed = edges.find((edge) => edge.source === id("t"));
    expect(dashed?.style?.strokeDasharray).toBe(TEST_DASH);
  });

  it("keeps the change class after edge-test", () => {
    const changed = { ...testNode, change: "added" as const };
    const { edges } = flow(
      [plain("a"), changed],
      [makeEdge(id("t"), id("a"))],
    );
    expect(edges[0]?.className).toBe("edge-call edge-test edge-change-added");
  });
});

describe("NodeBox for test code", () => {
  const render = (overrides: Parameters<typeof makeNode>[0]) =>
    renderToStaticMarkup(
      createElement(NodeBox, { node: makeNode(overrides), isFocus: false }),
    );

  it("adds is-test to a test box and not to another", () => {
    expect(render({ id: id("t"), isTest: true })).toContain(" is-test");
    expect(render({ id: id("p") })).not.toContain("is-test");
  });

  it("keeps the change class on a test box", () => {
    const html = render({ id: id("t"), isTest: true, change: "modified" });
    expect(html).toContain("change-modified");
    expect(html).toContain("is-test");
  });
});
