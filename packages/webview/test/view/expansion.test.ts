import { describe, expect, it } from "vitest";
import { rowGap } from "../../src/settings/column-gap.js";
import { isClear, type Rect } from "../../src/graph/layout/placement.js";
import { nodeHeight } from "../../src/graph/nodes/node-size.js";
import { setPositions } from "../../src/view/graph-state.js";
import { acceptExpansion, applyExpansion } from "../../src/view/expansion.js";
import { commitCentre, createView } from "../../src/view/view-state.js";
import type { GraphState } from "../../src/view/types.js";
import {
  calledSlice,
  graphOf,
  id,
  nodeIds,
  PROJECT,
  sliceOf,
} from "../support/graph-states.js";

const PITCH = 320 + 192;

function placedGraph(): GraphState {
  return setPositions(graphOf("a", ["b"], ["c"]), {
    [id("a")]: { x: 1000, y: 500 },
    [id("b")]: { x: 488, y: 500 },
    [id("c")]: { x: 1512, y: 500 },
  });
}

const expandB = () => sliceOf("b", ["d"], ["a", "e"]);

describe("applyExpansion", () => {
  it("puts suppliers a column left and consumers a column right of the expanded node", () => {
    const lowered = setPositions(placedGraph(), {
      [id("b")]: { x: 488, y: 1500 },
    });
    const { graph, added } = applyExpansion(
      lowered,
      id("b"),
      sliceOf("b", ["d"], ["a", "f"]),
      192,
    );
    expect(added).toEqual([id("d"), id("f")]);
    expect(graph.positions[id("d")]).toEqual({ x: 488 - PITCH, y: 1500 });
    expect(graph.positions[id("f")]).toEqual({ x: 488 + PITCH, y: 1500 });
  });

  it("puts new suppliers in code order beside the expanded node", () => {
    const { graph } = applyExpansion(
      placedGraph(),
      id("b"),
      calledSlice("b", ["f", "e", "d"]),
      192,
    );
    const placed = ["f", "e", "d"].map((name) => graph.positions[id(name)]);
    expect(placed.map((at) => at?.x)).toEqual(Array(3).fill(488 - PITCH));
    const ys = placed.map((at) => at?.y ?? 0);
    expect(ys[0]).toBeLessThan(ys[1] ?? 0);
    expect(ys[1]).toBeLessThan(ys[2] ?? 0);
  });

  it("keeps the new nodes clear of nodes already there, wherever they were dragged", () => {
    const { graph } = applyExpansion(placedGraph(), id("b"), expandB(), 192);
    const height = nodeHeight(
      graph.nodes[id("a")] ?? { lineCount: 3, codePreview: "x" },
    );
    const rectOf = (nodeId: string): Rect => ({
      ...(graph.positions[nodeId] ?? { x: 0, y: 0 }),
      width: 320,
      height,
    });
    expect(graph.positions[id("e")]).toEqual({
      x: 1000,
      y: 500 - rowGap(192) - height,
    });
    expect(isClear(rectOf(id("e")), rectOf(id("a")), rowGap(192))).toBe(true);
  });

  it("never writes a position that already exists", () => {
    const before = placedGraph();
    const { graph } = applyExpansion(before, id("b"), expandB(), 192);
    for (const [nodeId, at] of Object.entries(before.positions)) {
      expect(graph.positions[nodeId]).toEqual(at);
    }
    expect(nodeIds(graph)).toEqual([
      id("a"),
      id("b"),
      id("c"),
      id("d"),
      id("e"),
    ]);
  });

  it("does not change the graph it is given", () => {
    const before = placedGraph();
    const snapshot = structuredClone(before);
    applyExpansion(before, id("b"), expandB(), 192);
    expect(before).toEqual(snapshot);
  });

  it("records the slice and places nothing when no node is new", () => {
    const before = placedGraph();
    const { graph, added } = applyExpansion(
      before,
      id("c"),
      sliceOf("c", [], ["a"]),
      192,
    );
    expect(added).toEqual([]);
    expect(graph.positions).toEqual(before.positions);
    expect(Object.keys(graph.slices)).toContain(id("c"));
  });
});

describe("acceptExpansion", () => {
  const view = commitCentre(createView(), placedGraph());
  const answer = {
    slice: expandB(),
    project: PROJECT,
    mode: { kind: "expansion", nodeId: id("b"), generation: 1 },
  } as const;

  it("merges a matching answer into the current graph and reports the added nodes", () => {
    const accepted = acceptExpansion(view, answer, 192);
    expect(accepted.added).toEqual([id("d"), id("e")]);
    expect(accepted.view.current?.positions[id("d")]).toBeDefined();
    expect(accepted.view.current?.generation).toBe(1);
    expect(accepted.view.history).toBe(view.history);
    expect(accepted.view.nextGeneration).toBe(view.nextGeneration);
  });

  it("drops an answer for another generation", () => {
    const stale = { ...answer, mode: { ...answer.mode, generation: 2 } };
    const result = acceptExpansion(view, stale, 192);
    expect(result.view).toBe(view);
    expect(result.added).toEqual([]);
  });

  it("drops an answer for another project", () => {
    const result = acceptExpansion(view, { ...answer, project: "/other" }, 192);
    expect(result.view).toBe(view);
  });

  it("drops an answer for a node that is no longer in the graph", () => {
    const gone = {
      ...answer,
      slice: sliceOf("zzz", ["d"]),
      mode: { ...answer.mode, nodeId: id("zzz") },
    };
    expect(acceptExpansion(view, gone, 192).view).toBe(view);
  });

  it("drops an answer whose slice is about another node", () => {
    const mismatched = { ...answer, slice: sliceOf("c", ["d"]) };
    expect(acceptExpansion(view, mismatched, 192).view).toBe(view);
  });

  it("rejects an expansion of the centre", () => {
    const centre = {
      slice: sliceOf("a", ["x"]),
      project: PROJECT,
      mode: { kind: "expansion", nodeId: id("a"), generation: 1 },
    } as const;
    const result = acceptExpansion(view, centre, 192);
    expect(result.view).toBe(view);
    expect(result.added).toEqual([]);
  });

  it("drops an answer when there is no graph", () => {
    const empty = createView();
    expect(acceptExpansion(empty, answer, 192).view).toBe(empty);
  });
});
