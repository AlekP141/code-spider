import type { GraphSlice } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../../src/app/app-state.js";
import { rowGap } from "../../src/settings/column-gap.js";
import { CLOSED_HEIGHT, OPEN_HEIGHT } from "../support/geometry.js";
import {
  answerOf,
  id,
  PROJECT,
  sliceOf,
  tweakNode,
} from "../support/graph-states.js";

const MARGIN = rowGap(192);
const positions = {
  [id("a")]: { x: 1000, y: 0 },
  [id("b")]: { x: 488, y: 0 },
  [id("c")]: { x: 488, y: CLOSED_HEIGHT + MARGIN },
};

function showing(slice: GraphSlice = sliceOf("a", ["b", "c"])): AppState {
  const pending = reduceApp(createAppState(undefined), {
    type: "slice",
    slice,
    project: PROJECT,
    mode: { kind: "centre", sourceVersion: 0 },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions,
  });
}

function graphOf(state: AppState) {
  const graph = state.view.current;
  if (!graph) throw new Error("no graph");
  return graph;
}

const act = (state: AppState, action: AppAction) => reduceApp(state, action);
const opened = (state: AppState, name: string) =>
  act(state, { type: "nodeOpened", nodeId: id(name) });
const closed = (state: AppState, name: string) =>
  act(state, { type: "nodeClosed", nodeId: id(name) });

describe("nodeOpened", () => {
  it("opens the box in the current graph and replaces the view's current", () => {
    const before = showing();
    const next = opened(before, "b");
    expect(graphOf(next).open).toEqual([id("a"), id("b")]);
    expect(graphOf(next).positions[id("c")]).toEqual({
      x: 488,
      y: OPEN_HEIGHT + MARGIN,
    });
    expect(graphOf(next).revision).toBe(graphOf(before).revision + 1);
    expect(next.view.history).toBe(before.view.history);
    expect(next.fit).toBe(before.fit);
  });

  it("returns the very same state with no graph, an unknown id or a chip", () => {
    const empty = createAppState(undefined);
    expect(opened(empty, "b")).toBe(empty);
    const before = showing();
    expect(opened(before, "zz")).toBe(before);
    const chip = showing(
      tweakNode(sliceOf("a", ["b", "c"]), "b", { codePreview: "" }),
    );
    expect(opened(chip, "b")).toBe(chip);
  });

  it("pushes by the graph's own column gap rather than the view's", () => {
    const before = showing();
    const view = { ...before.view, columnGap: 480 };
    const next = opened({ ...before, view }, "b");
    expect(graphOf(next).columnGap).toBe(192);
    expect(graphOf(next).positions[id("c")]?.y).toBe(OPEN_HEIGHT + MARGIN);
  });
});

describe("nodeOpened and nodeClosed at any time", () => {
  const busy = (state: AppState) => ({ ...state, busy: true });
  const loading = (state: AppState) => ({ ...state, loading: [id("c")] });
  const refreshing = (state: AppState) => ({ ...state, refreshing: true });

  it("works while busy, loading and refreshing", () => {
    const states = { busy, loading, refreshing };
    for (const [label, make] of Object.entries(states)) {
      const before = make(showing());
      const next = opened(before, "b");
      expect(graphOf(next).open, label).toContain(id("b"));
      const back = closed(next, "b");
      expect(graphOf(back).open, label).toEqual([id("a")]);
      expect(back.busy, label).toBe(before.busy);
      expect(back.loading, label).toBe(before.loading);
      expect(back.refreshing, label).toBe(before.refreshing);
    }
  });
});

describe("nodeClosed", () => {
  it("closes an open box and returns the same state for a closed one", () => {
    const before = showing();
    const next = closed(before, "a");
    expect(graphOf(next).open).toEqual([]);
    expect(graphOf(next).revision).toBe(graphOf(before).revision + 1);
    expect(graphOf(next).positions).toEqual(graphOf(before).positions);
    expect(closed(before, "b")).toBe(before);
    expect(closed(createAppState(undefined), "a").view.current).toBe(
      undefined,
    );
  });
});

describe("opened boxes and the rest of the app", () => {
  it("restores the earlier graph with its own open state on Back", () => {
    const withB = opened(showing(), "b");
    const pending = act(withB, {
      type: "slice",
      slice: sliceOf("x"),
      project: PROJECT,
      mode: { kind: "centre", sourceVersion: 0 },
    });
    const other = act(pending, {
      type: "centreLaidOut",
      id: pending.pending?.id ?? -1,
      positions: { [id("x")]: { x: 0, y: 0 } },
    });
    expect(graphOf(other).open).toEqual([id("x")]);
    const back = act(other, { type: "back" });
    expect(graphOf(back).focusId).toBe(id("a"));
    expect(graphOf(back).open).toEqual([id("a"), id("b")]);
  });

  it("keeps a box open and the pushed positions when a refreshed answer arrives later", () => {
    const started = act(showing(), { type: "refreshStarted" });
    const stale = graphOf(started);
    const during = opened(started, "b");
    const answer = answerOf(stale, sliceOf("a", ["b", "c"]), [], 7);
    const next = act(during, answer);
    expect(graphOf(next).open).toEqual([id("a"), id("b")]);
    expect(graphOf(next).positions).toEqual(graphOf(during).positions);
    expect(next.refreshing).toBe(false);
  });

  it("still has the box open when the saved view is restored", () => {
    const next = opened(showing(), "b");
    const saved: unknown = JSON.parse(JSON.stringify(next.view));
    const restored = createAppState(saved);
    expect(graphOf(restored).open).toEqual([id("a"), id("b")]);
    expect(graphOf(restored).positions).toEqual(graphOf(next).positions);
  });
});
