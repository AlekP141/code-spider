import { describe, expect, it, vi } from "vitest";
import type { layoutPositions } from "../src/graph/layout.js";
import { tidyGraph } from "../src/graph/tidy-graph.js";
import { pinNodes, setPositions } from "../src/view/graph-state.js";
import type { GraphState } from "../src/view/types.js";
import { commitCentre, createView } from "../src/view/view-state.js";
import { graphOf, id } from "./support/graph-states.js";

const column: typeof layoutPositions = async (nodes) =>
  Object.fromEntries(
    nodes.map((node, index) => [node.id, { x: 0, y: index * 200 }]),
  );

function committed(): GraphState {
  const graph = commitCentre(createView(), graphOf("a", ["b"], ["c"])).current;
  if (!graph) throw new Error("no graph");
  return graph;
}

describe("tidyGraph", () => {
  it("returns the layout for the generation it started on", async () => {
    const graph = committed();
    const outcome = await tidyGraph(
      () => graph,
      () => 192,
      column,
    );
    expect(outcome).toEqual({
      generation: graph.generation,
      columnGap: 192,
      positions: {
        [id("a")]: { x: 0, y: 0 },
        [id("b")]: { x: 0, y: 200 },
        [id("c")]: { x: 0, y: 400 },
      },
    });
  });

  it("keeps a pinned node where it is and moves a neighbour that ELK put on it", async () => {
    const graph = pinNodes(committed(), { [id("a")]: { x: 0, y: 200 } });
    const outcome = await tidyGraph(
      () => graph,
      () => 192,
      column,
    );
    expect(outcome?.positions[id("a")]).toEqual({ x: 0, y: 200 });
    expect(outcome?.positions[id("b")]).toEqual({ x: 0, y: 84 });
    expect(outcome?.positions[id("c")]).toEqual({ x: 0, y: 400 });
  });

  it("lays out with the column gap it is given", async () => {
    const layout = vi.fn(column);
    const graph = committed();
    await tidyGraph(
      () => graph,
      () => 96,
      layout,
    );
    expect(layout).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      96,
    );
  });

  it("reports the column gap of the layout it used", async () => {
    const graph = committed();
    const outcome = await tidyGraph(
      () => graph,
      () => 96,
      column,
    );
    expect(outcome?.columnGap).toBe(96);
  });

  it("runs again on the current graph when it changed while ELK ran", async () => {
    const first = committed();
    const second = setPositions(first, { [id("a")]: { x: 5, y: 5 } });
    let current = first;
    const layout = vi.fn<typeof layoutPositions>(async (nodes, edges, gap) => {
      if (layout.mock.calls.length === 1) current = second;
      return column(nodes, edges, gap);
    });

    const outcome = await tidyGraph(
      () => current,
      () => 192,
      layout,
    );

    expect(layout).toHaveBeenCalledTimes(2);
    expect(outcome?.generation).toBe(second.generation);
  });

  it("gives up when the graph was replaced while ELK ran", async () => {
    const first = committed();
    let current: GraphState | undefined = first;
    const layout: typeof layoutPositions = async (nodes, edges, gap) => {
      current = { ...first, generation: first.generation + 1 };
      return column(nodes, edges, gap);
    };
    expect(
      await tidyGraph(
        () => current,
        () => 192,
        layout,
      ),
    ).toBeUndefined();
  });

  it("does nothing without a graph", async () => {
    const layout = vi.fn(column);
    expect(
      await tidyGraph(
        () => undefined,
        () => 192,
        layout,
      ),
    ).toBeUndefined();
    expect(layout).not.toHaveBeenCalled();
  });

  it("passes a layout failure on", async () => {
    const graph = committed();
    const failing: typeof layoutPositions = async () => {
      throw new Error("elk blew up");
    };
    await expect(
      tidyGraph(
        () => graph,
        () => 192,
        failing,
      ),
    ).rejects.toThrow("elk blew up");
  });
});
