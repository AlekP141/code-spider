import { describe, expect, it } from "vitest";
import {
  CODE_PADDING_Y,
  HEADER_HEIGHT,
  LINE_HEIGHT,
  NODE_WIDTH,
} from "../../src/graph/constants.js";
import { nodeHeight } from "../../src/graph/nodes/node-size.js";
import { toFlow } from "../../src/graph/to-flow.js";
import { graphFromSlice, pinNodes } from "../../src/view/graph-state.js";
import { flowOf } from "../support/flow.js";
import { PROJECT } from "../support/graph-states.js";
import {
  makeEdge,
  makeNode,
  makeSlice,
  readGolden,
} from "../support/slices.js";

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
    expect(handleSignup?.height).toBe(
      HEADER_HEIGHT + 6 * LINE_HEIGHT + 2 * CODE_PADDING_Y,
    );
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

  it("points edges from supplier to consumer with no label or data", () => {
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
      className: "edge-call",
    });
    for (const each of edges) {
      expect(each).not.toHaveProperty("label");
      expect(each).not.toHaveProperty("data");
    }
  });

  it("gives a supplier its label lines and a node supplying nothing none", () => {
    const labelsOf = (id: string) =>
      nodes.find((flowNode) => flowNode.id === id)?.data.labels;
    expect(labelsOf("src/signup.ts#validateUser")).toEqual([
      { kind: "returns", text: "ValidUserData" },
    ]);
    expect(labelsOf("src/signup.ts#handleSignup")).toEqual([
      { kind: "returns", text: "User" },
    ]);
    expect(labelsOf("src/app.ts#main")).toEqual([]);
  });
});

describe("toFlow edge style", () => {
  const graph = graphFromSlice(readGolden("jsx-Page.json"), PROJECT);
  const both = readGolden("basic-handleSignup.json");

  it("draws stepped edges as smoothstep and curved ones as default", () => {
    const types = (style?: "stepped" | "curved") =>
      toFlow(graphFromSlice(both, PROJECT), style).edges.map(
        (edge) => edge.type,
      );
    const count = both.edges.length;
    expect(types("stepped")).toEqual(Array(count).fill("smoothstep"));
    expect(types("curved")).toEqual(Array(count).fill("default"));
    expect(types()).toEqual(types("stepped"));
  });

  it("changes nothing else about the edges or the nodes", () => {
    const stepped = toFlow(graph, "stepped");
    const curved = toFlow(graph, "curved");
    const withoutType = (edges: typeof stepped.edges) =>
      edges.map(({ type: _type, ...rest }) => rest);
    expect(withoutType(curved.edges)).toEqual(withoutType(stepped.edges));
    expect(curved.nodes).toEqual(stepped.nodes);
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
  it("styles the JSX edge distinctly and puts the props type on the supplier", () => {
    const { nodes, edges } = flowOf(readGolden("jsx-Page.json"));
    expect(edges).toHaveLength(1);
    expect(edges[0]?.className).toBe("edge-jsx");
    expect(edges[0]?.style?.strokeWidth).toBe(2.5);
    const supplier = nodes.find((flowNode) => flowNode.id === edges[0]?.source);
    expect(supplier?.data.node.name).toBe("SignupForm");
    expect(supplier?.data.labels).toEqual([
      { kind: "jsx", text: "SignupFormProps" },
    ]);
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
    expect(heights.external).toBe(HEADER_HEIGHT);
    expect(heights.unknown).toBe(HEADER_HEIGHT);
    expect(heights.module).toBe(HEADER_HEIGHT);
    expect(heights.component).toBe(
      HEADER_HEIGHT + 12 * LINE_HEIGHT + 2 * CODE_PADDING_Y,
    );
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

  it("labels each supplier once and skips edges with nothing to supply", () => {
    const labelsOf = (id: string) =>
      nodes.find((flowNode) => flowNode.id === id)?.data.labels;
    expect(labelsOf(external.id)).toEqual([
      { kind: "returns", text: "Promise<void>" },
    ]);
    expect(labelsOf(unknown.id)).toEqual([]);
    expect(labelsOf(focus.id)).toEqual([
      { kind: "passes", text: "() => void" },
    ]);
  });

  it("adds no line for an edge whose end is missing", () => {
    const base = graphFromSlice(makeSlice(focus.id, [focus], []), PROJECT);
    const dangling = makeEdge(focus.id, "src/missing.ts#gone", {
      supplies: "Lost",
    });
    const graph = { ...base, edges: { [dangling.id]: dangling } };
    const flow = toFlow(graph);
    expect(flow.edges).toEqual([]);
    expect(flow.nodes[0]?.data.labels).toEqual([]);
  });

  it("drops edges whose endpoint is not in the graph", () => {
    expect(edges.some((edge) => edge.target === "src/missing.ts#gone")).toBe(
      false,
    );
    expect(edges).toHaveLength(3);
  });
});
