import type { GraphSlice } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../src/app-state.js";
import { nodeHeight } from "../src/graph/node-size.js";
import {
  collapseNode,
  mergeExpansion,
  pinNodes,
  setPositions,
} from "../src/view/graph-state.js";
import { isGraphState, isViewState } from "../src/view/persist.js";
import type { GraphState } from "../src/view/types.js";
import {
  commitCentre,
  createView,
  goBack,
  replaceCurrent,
} from "../src/view/view-state.js";
import { graphOf, id, PROJECT, sliceOf } from "./support/graph-states.js";

const laidOutAt = (columnGap: number): GraphState => ({
  ...graphOf("a", ["b"]),
  columnGap,
});

describe("GraphState.columnGap", () => {
  it("is kept by merging an expansion, collapsing, pinning and moving", () => {
    const graph = laidOutAt(96);
    const merged = mergeExpansion(graph, id("b"), sliceOf("b", ["d"], ["a"]));
    expect(merged.graph.columnGap).toBe(96);
    expect(collapseNode(merged.graph, id("b")).columnGap).toBe(96);
    expect(pinNodes(graph, { [id("a")]: { x: 1, y: 2 } }).columnGap).toBe(96);
    expect(setPositions(graph, { [id("a")]: { x: 1, y: 2 } }).columnGap).toBe(
      96,
    );
  });

  it("is restored by goBack while the view keeps the slider's value", () => {
    const first = commitCentre(createView(), laidOutAt(96));
    const second = commitCentre(
      { ...first, columnGap: 480 },
      { ...graphOf("b"), columnGap: 480 },
    );
    const back = goBack(second);
    expect(back.current?.columnGap).toBe(96);
    expect(back.columnGap).toBe(480);
    expect(isViewState(back)).toBe(true);
  });

  it("passes isGraphState when absent or normalised", () => {
    expect(isGraphState(graphOf("a", ["b"]))).toBe(true);
    expect(isGraphState(laidOutAt(96))).toBe(true);
  });

  it("fails isGraphState when not a normalised number", () => {
    expect(isGraphState({ ...laidOutAt(96), columnGap: 100 })).toBe(false);
    expect(isGraphState({ ...laidOutAt(96), columnGap: "192" })).toBe(false);
  });

  it("keeps a view with such graphs restorable", () => {
    const view = replaceCurrent(
      commitCentre(createView(), laidOutAt(96)),
      laidOutAt(480),
    );
    expect(isViewState(view)).toBe(true);
    expect(isViewState(JSON.parse(JSON.stringify(view)) as unknown)).toBe(true);
  });
});

describe("placing an expansion", () => {
  function expand(
    graphGap: number | undefined,
    slice: GraphSlice,
    viewGap: number,
  ): AppState {
    const pending = reduceApp(createAppState(undefined), {
      type: "slice",
      slice: sliceOf("a", ["b"]),
      project: PROJECT,
      mode: { kind: "centre" },
    });
    const shown = reduceApp(pending, {
      type: "centreLaidOut",
      id: pending.pending?.id ?? -1,
      positions: { [id("a")]: { x: 1000, y: 0 }, [id("b")]: { x: 488, y: 0 } },
    });
    const current = shown.view.current;
    if (!current) throw new Error("no graph");
    const state: AppState = {
      ...shown,
      view: {
        ...shown.view,
        columnGap: viewGap,
        current: { ...current, columnGap: graphGap },
      },
    };
    return reduceApp(state, {
      type: "slice",
      slice,
      project: PROJECT,
      mode: {
        kind: "expansion",
        nodeId: id("b"),
        generation: current.generation,
      },
    });
  }

  const expandedAt = (graphGap: number | undefined) =>
    expand(graphGap, sliceOf("b", ["d"], ["a"]), 480).view.current?.positions[
      id("d")
    ]?.x;

  it("uses the gap the graph was laid out with", () => {
    expect(expandedAt(192)).toBe(488 - (320 + 192));
  });

  it("falls back to the view's gap when the graph has none", () => {
    expect(expandedAt(undefined)).toBe(488 - (320 + 480));
  });

  it("stacks new boxes the row gap of the graph's own gap apart", () => {
    const spaceBetween = (graphGap: number | undefined, viewGap: number) => {
      const next = expand(graphGap, sliceOf("b", ["d", "e"], ["a"]), viewGap);
      const graph = next.view.current;
      const d = graph?.positions[id("d")]?.y ?? 0;
      const e = graph?.positions[id("e")]?.y ?? 0;
      const node = graph?.nodes[id("d")];
      return e - d - (node ? nodeHeight(node) : 0);
    };
    expect(spaceBetween(480, 192)).toBe(80);
    expect(spaceBetween(192, 480)).toBe(32);
    expect(spaceBetween(undefined, 480)).toBe(80);
  });
});
