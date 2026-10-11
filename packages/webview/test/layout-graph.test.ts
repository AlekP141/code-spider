import { describe, expect, it } from "vitest";
import { walkOrder } from "../src/graph/call-order.js";
import { NODE_WIDTH } from "../src/graph/constants.js";
import { layoutGraph, walkOrderedFlow } from "../src/graph/layout.js";
import { graphFromSlice, mergeExpansion } from "../src/view/graph-state.js";
import { PROJECT, calledSlice, id, tweakNode } from "./support/graph-states.js";
import {
  columnsOf,
  crowded,
  elkAlone,
  outOfOrder,
  randomGraph,
} from "./support/order-graphs.js";
import { makeEdge, makeNode, makeSlice, readGolden } from "./support/slices.js";

const signup = () =>
  graphFromSlice(readGolden("basic-handleSignup.json"), PROJECT);

const named = (columns: string[][]) =>
  columns.map((column) => column.map((nodeId) => nodeId.split("#")[1]));

describe("layoutGraph", () => {
  it("draws the handleSignup called functions in code order, with the callers on the right", async () => {
    const positions = await layoutGraph(signup(), 192);
    expect(named(columnsOf(positions))).toEqual([
      ["validateUser", "createUser", "sendWelcome"],
      ["handleSignup"],
      ["main", "retry"],
    ]);
  });

  it("gives the same layout however the slice lists its nodes and edges", async () => {
    const slice = readGolden("basic-handleSignup.json");
    const reversed = {
      ...slice,
      nodes: [...slice.nodes].reverse(),
      edges: [...slice.edges].reverse(),
    };
    const first = await layoutGraph(graphFromSlice(slice, PROJECT), 192);
    const second = await layoutGraph(graphFromSlice(reversed, PROJECT), 192);
    expect(second).toEqual(first);

    for (let seed = 1; seed <= 40; seed += 1) {
      const graph = randomGraph(seed);
      const flipped = {
        ...graph,
        nodes: Object.fromEntries(Object.entries(graph.nodes).reverse()),
        edges: Object.fromEntries(Object.entries(graph.edges).reverse()),
      };
      expect(await layoutGraph(flipped, 192), `seed ${seed}`).toEqual(
        await layoutGraph(graph, 192),
      );
    }
  });

  it("puts an expanded called function's own called functions in the next column, in code order", async () => {
    const base = graphFromSlice(
      calledSlice("handle", ["validate", "create", "send"], ["main"]),
      PROJECT,
    );
    const expansion = calledSlice("create", ["r", "p", "q"], ["handle"]);
    const graph = mergeExpansion(base, id("create"), expansion).graph;
    const positions = await layoutGraph(graph, 192);
    expect(named(columnsOf(positions))).toEqual([
      ["r", "p", "q"],
      ["validate", "create", "send"],
      ["handle"],
      ["main"],
    ]);
  });

  it("keeps the row gap in one column when the boxes differ in height", async () => {
    const tallest = tweakNode(calledSlice("f", ["a", "b", "c", "d"]), "a", {
      lineCount: 30,
    });
    const slice = tweakNode(tallest, "c", { lineCount: 1 });
    const graph = graphFromSlice(slice, PROJECT);
    for (const gap of [32, 192, 480]) {
      const positions = await layoutGraph(graph, gap);
      expect(named(columnsOf(positions))[0]).toEqual(["a", "b", "c", "d"]);
      expect(crowded(graph, positions, gap)).toEqual([]);
    }
  });

  it("puts a graph ELK alone leaves out of walk order into walk order", async () => {
    const graph = randomGraph(5);
    const order = walkOrder(graph);
    expect(outOfOrder(await elkAlone(graph, 192), order)).toBeGreaterThan(0);
    const positions = await layoutGraph(graph, 192);
    expect(outOfOrder(positions, order)).toBe(0);
    expect(crowded(graph, positions, 192)).toEqual([]);
  });

  it("puts the columns one pitch apart and gives every node one position, the same on every run", async () => {
    const graph = signup();
    for (const gap of [32, 192, 480]) {
      const positions = await layoutGraph(graph, gap);
      const xs = [
        ...new Set(Object.values(positions).map((point) => point.x)),
      ].sort((a, b) => a - b);
      xs.slice(1).forEach((x, index) => {
        expect(x - (xs[index] ?? 0)).toBeCloseTo(NODE_WIDTH + gap, 6);
      });
      expect(Object.keys(positions).sort()).toEqual(
        Object.keys(graph.nodes).sort(),
      );
      expect(await layoutGraph(graph, gap)).toEqual(positions);
    }
  });

  it("lays out a lone node and an edgeless graph", async () => {
    const lone = graphFromSlice(
      makeSlice("a#a", [makeNode({ id: "a#a" })], []),
      PROJECT,
    );
    expect(await layoutGraph(lone, 192)).toEqual({
      "a#a": { x: expect.any(Number), y: expect.any(Number) },
    });
    const several = graphFromSlice(
      makeSlice(
        "a#a",
        ["a#a", "a#b", "a#c"].map((nodeId) => makeNode({ id: nodeId })),
        [],
      ),
      PROJECT,
    );
    const positions = await layoutGraph(several, 192);
    expect(Object.keys(positions).sort()).toEqual(["a#a", "a#b", "a#c"]);
  });
});

describe("walkOrderedFlow", () => {
  const edgeIds = (graph: Parameters<typeof walkOrderedFlow>[0]) =>
    walkOrderedFlow(graph).edges.map((edge) => edge.id);

  it("lists edges by the walk position of the target, then the source, then the edge id", () => {
    expect(edgeIds(signup())).toEqual([
      "src/signup.ts#validateUser->src/signup.ts#handleSignup",
      "src/signup.ts#createUser->src/signup.ts#handleSignup",
      "src/signup.ts#sendWelcome->src/signup.ts#handleSignup",
      "src/signup.ts#handleSignup->src/app.ts#main",
      "src/signup.ts#handleSignup->src/app.ts#retry",
    ]);

    const slice = makeSlice(
      "a#b",
      [makeNode({ id: "a#a" }), makeNode({ id: "a#b" })],
      [
        makeEdge("a#a", "a#b", { id: "z" }),
        makeEdge("a#a", "a#b", { id: "y" }),
      ],
    );
    expect(edgeIds(graphFromSlice(slice, PROJECT))).toEqual(["y", "z"]);
  });
});
