import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../src/app-state.js";
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
  function expandedAt(graphGap: number | undefined): number | undefined {
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
        columnGap: 480,
        current: { ...current, columnGap: graphGap },
      },
    };
    const next = reduceApp(state, {
      type: "slice",
      slice: sliceOf("b", ["d"], ["a"]),
      project: PROJECT,
      mode: {
        kind: "expansion",
        nodeId: id("b"),
        generation: current.generation,
      },
    });
    return next.view.current?.positions[id("d")]?.x;
  }

  it("uses the gap the graph was laid out with", () => {
    expect(expandedAt(192)).toBe(488 - (320 + 192));
  });

  it("falls back to the view's gap when the graph has none", () => {
    expect(expandedAt(undefined)).toBe(488 - (320 + 480));
  });
});
