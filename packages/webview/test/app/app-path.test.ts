import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import type { PathMark, PathSearch } from "../../src/host/protocol.js";
import { isViewState } from "../../src/view/persist.js";
import { id } from "../support/graph-states.js";
import { pathMessage } from "../support/path-graphs.js";

const mark: PathMark = {
  project: "/repo/tsconfig.json",
  nodeId: id("a"),
  name: "a",
};
const search: PathSearch = {
  id: 1,
  purpose: "search",
  from: "a",
  to: "z",
  checked: 0,
  routes: 0,
  routesCapped: false,
};

const start = () => createAppState(undefined);
const searching = (state: AppState = start(), value: PathSearch = search) =>
  reduceApp(state, { type: "pathSearch", search: value });

function pendingOf(state: AppState) {
  if (!state.pending) throw new Error("nothing is pending");
  return state.pending;
}

describe("pathStart and pathSearch", () => {
  it("stores the mark and clears it on undefined", () => {
    const marked = reduceApp(start(), { type: "pathStart", mark });
    expect(marked.pathStart).toEqual(mark);
    expect(reduceApp(marked, { type: "pathStart", mark: undefined }).pathStart)
      .toBeUndefined();
  });

  it("stores the search and updates the counts of the same search", () => {
    const first = searching();
    expect(first.pathSearch).toEqual(search);
    const more = searching(first, { ...search, checked: 140, routes: 3 });
    expect(more.pathSearch).toMatchObject({ id: 1, checked: 140, routes: 3 });
  });
});

describe("cancelling", () => {
  it("is set by pathCancelRequested only while a search runs", () => {
    const idle = reduceApp(start(), { type: "pathCancelRequested" });
    expect(idle.cancelling).toBe(false);
    const asked = reduceApp(searching(), { type: "pathCancelRequested" });
    expect(asked.cancelling).toBe(true);
    expect(searching(asked, { ...search, checked: 9 }).cancelling).toBe(true);
  });

  it("clears when the search ends", () => {
    const asked = reduceApp(searching(), { type: "pathCancelRequested" });
    const ended = reduceApp(asked, { type: "pathSearch", search: undefined });
    expect(ended.pathSearch).toBeUndefined();
    expect(ended.cancelling).toBe(false);
  });

  it("clears when a search with another id arrives", () => {
    const asked = reduceApp(searching(), { type: "pathCancelRequested" });
    const next = searching(asked, { ...search, id: 2 });
    expect(next.pathSearch?.id).toBe(2);
    expect(next.cancelling).toBe(false);
  });
});

describe("pathFound", () => {
  it("becomes a pending centre carrying the path graph, the view's column gap and the test visibility", () => {
    const hiding = reduceApp(start(), {
      type: "testVisibilityChanged",
      value: "hide",
    });
    const next = reduceApp(hiding, pathMessage());
    const pending = pendingOf(next);
    expect(pending.graph.path).toEqual(pathMessage().path);
    expect(pending.graph.focusId).toBe(id("a"));
    expect(pending.graph.sourceVersion).toBe(4);
    expect(pending.columnGap).toBe(next.view.columnGap);
    expect(pending.testVisibility).toBe("hide");
    expect(next.view).toBe(hiding.view);
    expect(next.nextPending).toBe(hiding.nextPending + 1);
  });

  it("clears the error", () => {
    const failed = reduceApp(start(), { type: "analysisError", message: "x" });
    expect(reduceApp(failed, pathMessage()).error).toBeUndefined();
  });

  it("is committed by centreLaidOut with a new generation, and fits the view", () => {
    const next = reduceApp(start(), pathMessage());
    const positions = { [id("a")]: { x: 1, y: 2 } };
    const done = reduceApp(next, {
      type: "centreLaidOut",
      id: pendingOf(next).id,
      positions,
    });
    expect(done.pending).toBeUndefined();
    expect(done.view.current?.path).toBeDefined();
    expect(done.view.current?.generation).toBe(1);
    expect(done.view.current?.positions).toEqual(positions);
    expect(done.fit).toEqual({ token: 1, duration: 0 });
  });

  it("ignores a layout answer for an older pending path graph", () => {
    const one = reduceApp(start(), pathMessage());
    const two = reduceApp(one, pathMessage());
    const stale = reduceApp(two, {
      type: "centreLaidOut",
      id: pendingOf(one).id,
      positions: {},
    });
    expect(stale).toBe(two);
  });
});

describe("what is saved", () => {
  it("leaves pathSearch, pathStart and cancelling out of the view", () => {
    const before = start();
    const state = reduceApp(
      reduceApp(searching(reduceApp(before, { type: "pathStart", mark })), {
        type: "pathCancelRequested",
      }),
      { type: "pathStart", mark },
    );
    expect(state.view).toBe(before.view);
    expect(JSON.stringify(state.view)).not.toContain("cancelling");
    expect(isViewState(state.view)).toBe(true);
    const restored = createAppState(JSON.parse(JSON.stringify(state.view)));
    expect(restored.pathSearch).toBeUndefined();
    expect(restored.pathStart).toBeUndefined();
    expect(restored.cancelling).toBe(false);
  });
});
