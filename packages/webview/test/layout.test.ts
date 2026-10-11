import { describe, expect, it } from "vitest";
import { rowGap } from "../src/column-gap.js";
import { buildElkGraph, layoutPositions } from "../src/graph/layout.js";
import { flowOf } from "./support/flow.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

describe("buildElkGraph", () => {
  it("asks ELK for a left-to-right layered layout of the sized nodes", () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    const graph = buildElkGraph(nodes, edges, 192);
    expect(graph.layoutOptions).toMatchObject({
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "32",
    });
    expect(graph.children).toHaveLength(nodes.length);
    expect(graph.children?.[0]).toMatchObject({
      id: nodes[0]?.id,
      width: 320,
      height: nodes[0]?.height,
    });
    expect(graph.edges).toHaveLength(edges.length);
    expect(graph.edges?.[0]).toMatchObject({
      id: edges[0]?.id,
      sources: [edges[0]?.source],
      targets: [edges[0]?.target],
    });
  });

  it("asks ELK to keep the model order of nodes and edges", () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    expect(buildElkGraph(nodes, edges, 192).layoutOptions).toMatchObject({
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
    });
  });

  it("sets the spacing inside a column from the row gap", () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    const spacing = (gap: number) =>
      buildElkGraph(nodes, edges, gap).layoutOptions?.["elk.spacing.nodeNode"];
    expect(spacing(32)).toBe("16");
    expect(spacing(192)).toBe("32");
    expect(spacing(480)).toBe("80");
  });

  it("sets the spacing between layers from the column gap", () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    for (const gap of [32, 192, 480]) {
      expect(
        buildElkGraph(nodes, edges, gap).layoutOptions?.[
          "elk.layered.spacing.nodeNodeBetweenLayers"
        ],
      ).toBe(String(gap));
    }
  });
});

describe("layoutPositions", () => {
  it("puts suppliers to the left of their consumers along a chain", async () => {
    const slice = makeSlice(
      "a#b",
      [
        makeNode({ id: "a#a" }),
        makeNode({ id: "a#b" }),
        makeNode({ id: "a#c" }),
      ],
      [makeEdge("a#a", "a#b"), makeEdge("a#b", "a#c")],
    );
    const { nodes, edges } = flowOf(slice);
    const positions = await layoutPositions(nodes, edges, 192);
    const x = (id: string) => positions[id]?.x ?? Number.NaN;
    expect(x("a#a")).toBeLessThan(x("a#b"));
    expect(x("a#b")).toBeLessThan(x("a#c"));
  });

  it("leaves the column gap between a supplier and its consumer", async () => {
    const slice = makeSlice(
      "a#b",
      [makeNode({ id: "a#a" }), makeNode({ id: "a#b" })],
      [makeEdge("a#a", "a#b")],
    );
    const { nodes, edges } = flowOf(slice);
    for (const gap of [32, 192, 480]) {
      const positions = await layoutPositions(nodes, edges, gap);
      const space = (positions["a#b"]?.x ?? 0) - (positions["a#a"]?.x ?? 0);
      expect(space).toBe(320 + gap);
    }
  });

  it("stacks several suppliers in one column without overlap", async () => {
    const suppliers = ["a#s1", "a#s2", "a#s3"].map((id) =>
      makeNode({ id, lineCount: 8 }),
    );
    const consumer = makeNode({ id: "a#c" });
    const slice = makeSlice(
      consumer.id,
      [...suppliers, consumer],
      suppliers.map((supplier) => makeEdge(supplier.id, consumer.id)),
    );
    const { nodes, edges } = flowOf(slice);
    const positions = await layoutPositions(nodes, edges, 192);

    const column = suppliers.map((supplier) => positions[supplier.id]);
    expect(new Set(column.map((position) => position?.x)).size).toBe(1);
    expect(positions[consumer.id]?.x).toBeGreaterThan(column[0]?.x ?? 0);

    const height = nodes[0]?.height ?? 0;
    const tops = column
      .map((position) => position?.y ?? 0)
      .sort((a, b) => a - b);
    expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBeGreaterThanOrEqual(height);
    expect((tops[2] ?? 0) - (tops[1] ?? 0)).toBeGreaterThanOrEqual(height);
  });

  it("keeps the row gap between boxes of one column at every slider value", async () => {
    const suppliers = ["a#s1", "a#s2", "a#s3"].map((id) =>
      makeNode({ id, lineCount: 8 }),
    );
    const consumer = makeNode({ id: "a#c" });
    const slice = makeSlice(
      consumer.id,
      [...suppliers, consumer],
      suppliers.map((supplier) => makeEdge(supplier.id, consumer.id)),
    );
    const { nodes, edges } = flowOf(slice);
    const height = nodes[0]?.height ?? 0;
    for (const gap of [32, 192, 480]) {
      const positions = await layoutPositions(nodes, edges, gap);
      const tops = suppliers
        .map((supplier) => positions[supplier.id]?.y ?? 0)
        .sort((a, b) => a - b);
      expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBeGreaterThanOrEqual(
        height + rowGap(gap),
      );
      expect((tops[2] ?? 0) - (tops[1] ?? 0)).toBeGreaterThanOrEqual(
        height + rowGap(gap),
      );
    }
  });

  it("returns a position for every node and is deterministic", async () => {
    const { nodes, edges } = flowOf(readGolden("basic-handleSignup.json"));
    const first = await layoutPositions(nodes, edges, 192);
    const second = await layoutPositions(nodes, edges, 192);
    expect(Object.keys(first).sort()).toEqual(nodes.map((n) => n.id).sort());
    expect(second).toEqual(first);
  });

  it("lays out a lone node and an edgeless graph", async () => {
    const { nodes, edges } = flowOf(
      makeSlice("a#a", [makeNode({ id: "a#a" })], []),
    );
    const positions = await layoutPositions(nodes, edges, 192);
    expect(positions["a#a"]).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });
});
