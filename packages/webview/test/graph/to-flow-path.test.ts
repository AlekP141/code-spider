import { describe, expect, it } from "vitest";
import { toFlow } from "../../src/graph/to-flow.js";
import { DASHED, DOTTED } from "../../src/graph/edge-appearance.js";
import type { GraphState } from "../../src/view/types.js";
import { graphOf, id, PROJECT } from "../support/graph-states.js";
import { pathGraph, pathParts } from "../support/path-graphs.js";
import { makeEdge } from "../support/slices.js";

const link = (from: string, to: string) => `${id(from)}->${id(to)}`;

function nodeOf(flow: ReturnType<typeof toFlow>, name: string) {
  const found = flow.nodes.find((node) => node.id === id(name));
  if (!found) throw new Error(`no node ${name}`);
  return found;
}

function edgeOf(flow: ReturnType<typeof toFlow>, from: string, to: string) {
  const found = flow.edges.find((edge) => edge.id === link(from, to));
  if (!found) throw new Error(`no edge ${from}->${to}`);
  return found;
}

describe("toFlow on a path graph", () => {
  const flow = toFlow(pathGraph());

  it("flags route nodes, tags A and B, and asks for the extra handles", () => {
    for (const name of ["a", "m", "z"]) {
      expect(nodeOf(flow, name).data).toMatchObject({
        onRoute: true,
        marked: false,
        routeHandles: true,
      });
    }
    expect(nodeOf(flow, "a").data.tag).toBe("A");
    expect(nodeOf(flow, "z").data.tag).toBe("B");
    expect(nodeOf(flow, "m").data.tag).toBeUndefined();
  });

  it("gives route edges edge-route and width 4, keeping the kind's dash", () => {
    const am = edgeOf(flow, "a", "m");
    expect(am.className).toBe("edge-call edge-route");
    expect(am.style?.strokeWidth).toBe(4);
    expect(am.style?.strokeDasharray).toBeUndefined();

    const parts = pathParts();
    const dotted = {
      ...parts,
      route: {
        ...parts.route,
        edges: parts.route.edges.map((edge) =>
          edge.id === link("m", "z")
            ? { ...edge, kind: "passes" as const }
            : edge,
        ),
      },
    };
    const passes = edgeOf(toFlow(pathGraph(dotted)), "m", "z");
    expect(passes.className).toBe("edge-passes edge-route");
    expect(passes.style).toMatchObject({
      strokeDasharray: DOTTED,
      strokeWidth: 4,
    });

    const unresolved = {
      ...parts,
      route: {
        ...parts.route,
        edges: parts.route.edges.map((edge) =>
          edge.id === link("m", "z") ? { ...edge, resolved: false } : edge,
        ),
      },
    };
    expect(
      edgeOf(toFlow(pathGraph(unresolved)), "m", "z").style?.strokeDasharray,
    ).toBe(DASHED);
  });

  it("uses the left source and right target handles when the target column is earlier", () => {
    const parts = pathParts();
    const backward = pathGraph({
      ...parts,
      route: {
        ...parts.route,
        edges: [...parts.route.edges, makeEdge(id("z"), id("m"))],
      },
      path: {
        ...parts.path,
        edgeIds: [...parts.path.edgeIds, link("z", "m")],
      },
    });
    const edge = edgeOf(toFlow(backward), "z", "m");
    expect(edge.sourceHandle).toBe("source-left");
    expect(edge.targetHandle).toBe("target-right");
  });

  it("leaves a forward route edge on the default handles", () => {
    const edge = edgeOf(flow, "m", "z");
    expect(edge).not.toHaveProperty("sourceHandle");
    expect(edge).not.toHaveProperty("targetHandle");
  });

  it("keeps A's non-route neighbours and edges plain", () => {
    const s = nodeOf(flow, "s");
    expect(s.data).toMatchObject({ onRoute: false, routeHandles: true });
    expect(s.data.tag).toBeUndefined();
    const edge = edgeOf(flow, "s", "a");
    expect(edge.className).toBe("edge-call");
    expect(edge.style?.strokeWidth).toBe(1.5);
    expect(edge).not.toHaveProperty("sourceHandle");
  });
});

describe("toFlow without a path", () => {
  it("produces the same flow as before when there is no mark", () => {
    const graph: GraphState = graphOf("a", ["b"], ["c"]);
    const plain = toFlow(graph);
    expect(toFlow(graph, undefined, {})).toEqual(plain);
    expect(toFlow(graph, undefined, { mark: undefined })).toEqual(plain);
    for (const node of plain.nodes) {
      expect(Object.keys(node.data).sort()).toEqual(
        ["isFocus", "labels", "node", "open", "pinned"].sort(),
      );
    }
    for (const edge of plain.edges) {
      expect(edge).not.toHaveProperty("sourceHandle");
      expect(edge).not.toHaveProperty("targetHandle");
    }
  });
});

describe("toFlow with a start mark", () => {
  const graph = graphOf("a", ["b"], ["c"]);
  const mark = { project: PROJECT, nodeId: id("b"), name: "b" };
  const markedIds = (flow: ReturnType<typeof toFlow>) =>
    flow.nodes.filter((node) => node.data.marked).map((node) => node.id);

  it("marks the box that is the mark in the same project, not in another or with no mark", () => {
    expect(markedIds(toFlow(graph, undefined, { mark }))).toEqual([id("b")]);
    const elsewhere = { ...mark, project: "/elsewhere/tsconfig.json" };
    expect(markedIds(toFlow(graph, undefined, { mark: elsewhere }))).toEqual(
      [],
    );
    expect(markedIds(toFlow(graph))).toEqual([]);
    const onPath = toFlow(pathGraph(), undefined, {
      mark: { ...mark, nodeId: id("s") },
    });
    expect(markedIds(onPath)).toEqual([id("s")]);
  });
});
