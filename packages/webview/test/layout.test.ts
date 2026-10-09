import { describe, expect, it } from "vitest";
import { buildElkGraph, layoutPositions } from "../src/graph/layout.js";
import { toFlow } from "../src/graph/to-flow.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

describe("buildElkGraph", () => {
  it("asks ELK for a left-to-right layered layout of the sized nodes", () => {
    const { nodes, edges } = toFlow(readGolden("basic-handleSignup.json"));
    const graph = buildElkGraph(nodes, edges);
    expect(graph.layoutOptions).toMatchObject({
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
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
    const { nodes, edges } = toFlow(slice);
    const positions = await layoutPositions(nodes, edges);
    const x = (id: string) => positions.get(id)?.x ?? Number.NaN;
    expect(x("a#a")).toBeLessThan(x("a#b"));
    expect(x("a#b")).toBeLessThan(x("a#c"));
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
    const { nodes, edges } = toFlow(slice);
    const positions = await layoutPositions(nodes, edges);

    const column = suppliers.map((supplier) => positions.get(supplier.id));
    expect(new Set(column.map((position) => position?.x)).size).toBe(1);
    expect(positions.get(consumer.id)?.x).toBeGreaterThan(column[0]?.x ?? 0);

    const height = nodes[0]?.height ?? 0;
    const tops = column
      .map((position) => position?.y ?? 0)
      .sort((a, b) => a - b);
    expect((tops[1] ?? 0) - (tops[0] ?? 0)).toBeGreaterThanOrEqual(height);
    expect((tops[2] ?? 0) - (tops[1] ?? 0)).toBeGreaterThanOrEqual(height);
  });

  it("returns a position for every node and is deterministic", async () => {
    const { nodes, edges } = toFlow(readGolden("basic-handleSignup.json"));
    const first = await layoutPositions(nodes, edges);
    const second = await layoutPositions(nodes, edges);
    expect([...first.keys()].sort()).toEqual(nodes.map((n) => n.id).sort());
    expect([...second.entries()]).toEqual([...first.entries()]);
  });

  it("lays out a lone node and an edgeless graph", async () => {
    const slice = makeSlice("a#a", [makeNode({ id: "a#a" })], []);
    const { nodes, edges } = toFlow(slice);
    const positions = await layoutPositions(nodes, edges);
    expect(positions.get("a#a")).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });
});
