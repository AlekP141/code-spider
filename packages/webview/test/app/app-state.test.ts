import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../../src/app/app-state.js";
import { createView, commitCentre } from "../../src/view/view-state.js";
import { id, PROJECT, sliceOf } from "../support/graph-states.js";

const centre = (
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
): AppAction => ({
  type: "slice",
  slice: sliceOf(focus, suppliers, consumers),
  project: PROJECT,
  mode: { kind: "centre", sourceVersion: 0 },
});

function pendingId(state: AppState): number {
  if (!state.pending) throw new Error("nothing is pending");
  return state.pending.id;
}

/** A state that shows `focus`, as if its layout had finished. */
function showing(
  focus: string,
  suppliers: string[] = [],
  consumers: string[] = [],
  positions: Record<string, { x: number; y: number }> = {},
): AppState {
  const pending = reduceApp(
    createAppState(undefined),
    centre(focus, suppliers, consumers),
  );
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pendingId(pending),
    positions,
  });
}

describe("createAppState", () => {
  it("starts with an empty view", () => {
    expect(createAppState(undefined)).toEqual({
      view: createView(),
      error: undefined,
      busy: false,
      indexing: false,
      pending: undefined,
      nextPending: 1,
      fit: { token: 0, duration: 0 },
      loading: [],
      failures: {},
      entering: { ids: [], token: 0 },
      nextToken: 1,
      reveal: undefined,
      refreshing: false,
      diffMode: "uncommitted",
      settingsApplied: false,
    });
  });

  it("restores a saved view and ignores one that fails the structural check", () => {
    const saved = commitCentre(createView(), showing("a").view.current!);
    expect(createAppState(saved).view).toBe(saved);
    expect(createAppState({ version: 2 }).view).toEqual(createView());
    expect(createAppState("junk").view).toEqual(createView());
  });
});

describe("centre slices", () => {
  it("wait for their layout while the old graph stays", () => {
    const before = showing("a", ["b"]);
    const next = reduceApp(before, centre("z"));
    expect(next.pending?.graph.focusId).toBe(id("z"));
    expect(next.pending?.columnGap).toBe(before.view.columnGap);
    expect(next.view).toBe(before.view);
  });

  it("are committed when laid out: new generation, history and a refit", () => {
    const first = showing("a", ["b"]);
    expect(first.view.current?.focusId).toBe(id("a"));
    expect(first.view.current?.generation).toBe(1);
    expect(first.pending).toBeUndefined();
    expect(first.fit).toEqual({ token: 1, duration: 0 });

    const pending = reduceApp(first, centre("z"));
    const second = reduceApp(pending, {
      type: "centreLaidOut",
      id: pendingId(pending),
      positions: { [id("z")]: { x: 7, y: 8 } },
    });
    expect(second.view.current?.focusId).toBe(id("z"));
    expect(second.view.current?.generation).toBe(2);
    expect(second.view.current?.positions).toEqual({
      [id("z")]: { x: 7, y: 8 },
    });
    expect(second.view.history).toEqual([first.view.current]);
    expect(second.fit.token).toBe(2);
  });

  it("let the newest slice win when layouts overlap", () => {
    const one = reduceApp(createAppState(undefined), centre("a"));
    const two = reduceApp(one, centre("b"));
    const stale = reduceApp(two, {
      type: "centreLaidOut",
      id: pendingId(one),
      positions: {},
    });
    expect(stale).toBe(two);
    const fresh = reduceApp(two, {
      type: "centreLaidOut",
      id: pendingId(two),
      positions: {},
    });
    expect(fresh.view.current?.focusId).toBe(id("b"));
  });

  it("keep the old graph and show a banner when the layout fails", () => {
    const before = showing("a");
    const pending = reduceApp(before, centre("z"));
    const failed = reduceApp(pending, {
      type: "centreLayoutFailed",
      id: pendingId(pending),
      message: "boom",
    });
    expect(failed.error).toBe("Could not lay out the graph: boom");
    expect(failed.pending).toBeUndefined();
    expect(failed.view).toBe(before.view);

    const stale = reduceApp(pending, {
      type: "centreLayoutFailed",
      id: 999,
      message: "late",
    });
    expect(stale).toBe(pending);
  });
});

describe("messages about the extension's work", () => {
  it("keeps the graph when an error arrives", () => {
    const before = showing("a");
    const next = reduceApp(before, { type: "analysisError", message: "boom" });
    expect(next.view).toBe(before.view);
    expect(next.error).toBe("boom");
  });

  it("clears a stale error when new work starts, not when it ends", () => {
    const failed = reduceApp(createAppState(undefined), {
      type: "analysisError",
      message: "boom",
    });
    const started = reduceApp(failed, { type: "busy", busy: true });
    expect(started.busy).toBe(true);
    expect(started.error).toBeUndefined();

    const failedAgain = reduceApp(started, {
      type: "analysisError",
      message: "again",
    });
    const ended = reduceApp(failedAgain, { type: "busy", busy: false });
    expect(ended.busy).toBe(false);
    expect(ended.error).toBe("again");
  });

  it("tracks indexing separately from busy", () => {
    const next = reduceApp(createAppState(undefined), {
      type: "indexing",
      indexing: true,
    });
    expect(next.indexing).toBe(true);
    expect(next.busy).toBe(false);
  });

  it("applies the first settings message to the column gap", () => {
    const state = showing("a");
    const next = reduceApp(state, {
      type: "settings",
      columnGap: 96,
      edgeStyle: "stepped",
      diffMode: "uncommitted",
    });
    expect(next.view.columnGap).toBe(96);
    expect(next.settingsApplied).toBe(true);
  });
});

describe("expansion answers", () => {
  const positions = {
    [id("a")]: { x: 1000, y: 500 },
    [id("b")]: { x: 488, y: 1500 },
  };

  it("are merged into the current graph and placed", () => {
    const before = showing("a", ["b"], [], positions);
    const next = reduceApp(before, {
      type: "slice",
      slice: sliceOf("b", ["d"], ["a"]),
      project: PROJECT,
      mode: { kind: "expansion", nodeId: id("b"), generation: 1 },
    });
    expect(Object.keys(next.view.current?.nodes ?? {})).toContain(id("d"));
    expect(next.view.current?.positions[id("d")]).toBeDefined();
    expect(next.view.current?.positions[id("a")]).toEqual(positions[id("a")]);
  });

  it("are dropped when they belong to an older graph", () => {
    const before = showing("a", ["b"], [], positions);
    const next = reduceApp(before, {
      type: "slice",
      slice: sliceOf("b", ["d"], ["a"]),
      project: PROJECT,
      mode: { kind: "expansion", nodeId: id("b"), generation: 7 },
    });
    expect(next).toBe(before);
  });
});

describe("drag and Tidy results", () => {
  it("pins dragged nodes at their final positions", () => {
    const before = showing("a", ["b"]);
    const next = reduceApp(before, {
      type: "dragStopped",
      positions: { [id("b")]: { x: 12, y: 34 } },
    });
    expect(next.view.current?.pinned).toEqual([id("b")]);
    expect(next.view.current?.positions[id("b")]).toEqual({ x: 12, y: 34 });
    expect(
      reduceApp(createAppState(undefined), {
        type: "dragStopped",
        positions: {},
      }).view.current,
    ).toBeUndefined();
  });

  it("applies a tidy result to the graph it was computed for and refits over 250 ms", () => {
    const before = showing("a", ["b"]);
    const generation = before.view.current?.generation ?? -1;
    const next = reduceApp(before, {
      type: "tidied",
      generation,
      columnGap: 192,
      positions: { [id("a")]: { x: 3, y: 4 } },
    });
    expect(next.view.current?.positions[id("a")]).toEqual({ x: 3, y: 4 });
    expect(next.view.current?.pinned).toEqual([]);
    expect(next.fit).toEqual({ token: before.fit.token + 1, duration: 250 });

    const stale = reduceApp(before, {
      type: "tidied",
      generation: generation + 1,
      columnGap: 192,
      positions: { [id("a")]: { x: 3, y: 4 } },
    });
    expect(stale).toBe(before);
  });

  it("shows a banner when Tidy fails and leaves the graph alone", () => {
    const before = showing("a");
    const next = reduceApp(before, { type: "tidyFailed", message: "boom" });
    expect(next.error).toBe("Could not lay out the graph: boom");
    expect(next.view).toBe(before.view);
  });
});
