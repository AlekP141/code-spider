import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../src/graph/constants.js";
import { nodeHeight } from "../src/graph/node-size.js";
import { toFlow, truncateLabel } from "../src/graph/to-flow.js";
import { graphFromSlice, pinNodes } from "../src/view/graph-state.js";
import { flowOf } from "./support/flow.js";
import { PROJECT } from "./support/graph-states.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

describe("toFlow with a real call-chain slice", () => {
  const slice = readGolden("basic-handleSignup.json");
  const { nodes, edges } = flowOf(slice);

  it("maps every node with uniform width and analytic height", () => {
    expect(nodes).toHaveLength(slice.nodes.length);
    for (const flowNode of nodes) {
      expect(flowNode.type).toBe("spider");
      expect(flowNode.width).toBe(NODE_WIDTH);
      expect(flowNode.height).toBe(nodeHeight(flowNode.data.node));
      expect(flowNode.position).toEqual({ x: 0, y: 0 });
    }
    const handleSignup = nodes.find(
      (flowNode) => flowNode.id === "src/signup.ts#handleSignup",
    );
    expect(handleSignup?.height).toBe(28 + 6 * 16 + 8);
  });

  it("gives every node its analytic size as measured, so React Flow never reads the DOM", () => {
    for (const flowNode of nodes) {
      expect(flowNode.measured).toEqual({
        width: NODE_WIDTH,
        height: nodeHeight(flowNode.data.node),
      });
    }
  });

  it("flags only the focus node", () => {
    const focused = nodes.filter((flowNode) => flowNode.data.isFocus);
    expect(focused.map((flowNode) => flowNode.id)).toEqual([
      "src/signup.ts#handleSignup",
    ]);
  });

  it("points edges from supplier to consumer and labels them with supplies", () => {
    expect(edges).toHaveLength(slice.edges.length);
    const edge = edges.find(
      (candidate) =>
        candidate.id ===
        "src/signup.ts#validateUser->src/signup.ts#handleSignup",
    );
    expect(edge).toMatchObject({
      source: "src/signup.ts#validateUser",
      target: "src/signup.ts#handleSignup",
      type: "smoothstep",
      label: "ValidUserData",
      className: "edge-call",
      data: { fullLabel: "ValidUserData" },
    });
  });
});

describe("toFlow positions and pins", () => {
  const slice = readGolden("basic-handleSignup.json");

  it("takes node positions from the graph and falls back to the origin", () => {
    const { nodes } = flowOf(slice, {
      "src/signup.ts#handleSignup": { x: 40, y: 60 },
    });
    const at = (id: string) => nodes.find((node) => node.id === id)?.position;
    expect(at("src/signup.ts#handleSignup")).toEqual({ x: 40, y: 60 });
    expect(at("src/app.ts#main")).toEqual({ x: 0, y: 0 });
  });

  it("marks exactly the pinned nodes", () => {
    const graph = pinNodes(graphFromSlice(slice, PROJECT), {
      "src/app.ts#main": { x: 1, y: 2 },
    });
    const { nodes } = toFlow(graph);
    expect(
      nodes.filter((node) => node.data.pinned).map((node) => node.id),
    ).toEqual(["src/app.ts#main"]);
    expect(
      nodes.find((node) => node.id === "src/app.ts#main")?.position,
    ).toEqual({ x: 1, y: 2 });
  });
});

describe("toFlow with a JSX slice", () => {
  it("styles the JSX edge distinctly and labels it with the props type", () => {
    const { edges } = flowOf(readGolden("jsx-Page.json"));
    expect(edges).toHaveLength(1);
    expect(edges[0]?.className).toBe("edge-jsx");
    expect(edges[0]?.label).toBe("SignupFormProps");
    expect(edges[0]?.style?.strokeWidth).toBe(2.5);
  });
});

describe("toFlow with every node and edge kind", () => {
  const focus = makeNode({
    id: "src/a.ts#focus",
    kind: "component",
    lineCount: 12,
  });
  const external = makeNode({
    id: "external:tiny-lib#persist",
    kind: "external",
    file: "",
    lineCount: 0,
    codePreview: "",
  });
  const unknown = makeNode({
    id: "unknown:src/a.ts#focus#props.onPick()",
    kind: "unknown",
    file: "",
    lineCount: 0,
    codePreview: "",
  });
  const module = makeNode({
    id: "src/main.tsx#<module>",
    kind: "module",
    name: "main.tsx",
    lineCount: 40,
    codePreview: "",
  });
  const slice = makeSlice(
    focus.id,
    [focus, external, unknown, module],
    [
      makeEdge(external.id, focus.id, {
        kind: "external",
        supplies: "Promise<void>",
      }),
      makeEdge(unknown.id, focus.id, { resolved: false }),
      makeEdge(focus.id, module.id, { kind: "passes", supplies: "() => void" }),
      makeEdge(focus.id, "src/missing.ts#gone"),
    ],
  );
  const { nodes, edges } = flowOf(slice);

  it("sizes chips as header-only boxes and functions by their lines", () => {
    const heights = Object.fromEntries(
      nodes.map((flowNode) => [flowNode.data.node.kind, flowNode.height]),
    );
    expect(heights.external).toBe(28);
    expect(heights.unknown).toBe(28);
    expect(heights.module).toBe(28);
    expect(heights.component).toBe(28 + 12 * 16 + 8);
  });

  it("applies the passes, unresolved and external appearances", () => {
    const dash = (className: string) =>
      edges.find((edge) => edge.className === className)?.style
        ?.strokeDasharray;
    expect(edges.map((edge) => edge.className).sort()).toEqual([
      "edge-call edge-unresolved",
      "edge-external",
      "edge-passes",
    ]);
    expect(dash("edge-passes")).toBe("1 5");
    expect(dash("edge-call edge-unresolved")).toBe("6 4");
    expect(dash("edge-external")).toBeUndefined();
  });

  it("omits the label of an edge with nothing to supply", () => {
    const unresolved = edges.find((edge) => edge.source === unknown.id);
    expect(unresolved?.label).toBeUndefined();
  });

  it("drops edges whose endpoint is not in the graph", () => {
    expect(edges.some((edge) => edge.target === "src/missing.ts#gone")).toBe(
      false,
    );
    expect(edges).toHaveLength(3);
  });
});

describe("truncateLabel", () => {
  it("leaves short labels alone", () => {
    expect(truncateLabel("User")).toBe("User");
  });

  it("cuts long labels to the limit with an ellipsis and keeps the full text in data", () => {
    const long = "A".repeat(100);
    expect(truncateLabel(long)).toHaveLength(40);
    expect(truncateLabel(long).endsWith("…")).toBe(true);
    const slice = makeSlice(
      "a#a",
      [makeNode({ id: "a#a" }), makeNode({ id: "a#b" })],
      [makeEdge("a#b", "a#a", { supplies: long })],
    );
    const edge = flowOf(slice).edges[0];
    expect(edge?.label).toHaveLength(40);
    expect(edge?.data?.fullLabel).toBe(long);
  });
});
