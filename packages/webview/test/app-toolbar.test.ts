import { describe, expect, it } from "vitest";
import {
  createAppState,
  isWorking,
  reduceApp,
  type AppAction,
  type AppState,
} from "../src/app-state.js";
import { isViewState } from "../src/view/persist.js";
import { canGoBack } from "../src/view/view-state.js";
import { id, PROJECT, sliceOf } from "./support/graph-states.js";

const centre = (focus: string, suppliers: string[] = []): AppAction => ({
  type: "slice",
  slice: sliceOf(focus, suppliers),
  project: PROJECT,
  mode: { kind: "centre" },
});

function laidOut(state: AppState, focus: string): AppState {
  const pending = reduceApp(state, centre(focus, ["s"]));
  if (!pending.pending) throw new Error("nothing is pending");
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending.id,
    positions: { [id(focus)]: { x: 10, y: 20 }, [id("s")]: { x: 0, y: 0 } },
  });
}

/** Shows `a`, then `b`, so the history holds `a`. */
function twoGraphs(): AppState {
  return laidOut(laidOut(createAppState(undefined), "a"), "b");
}

describe("back", () => {
  it("restores the previous graph under a new generation with a fresh fit", () => {
    const before = twoGraphs();
    const next = reduceApp(before, { type: "back" });
    const current = next.view.current;
    expect(current?.focusId).toBe(id("a"));
    expect(current?.positions[id("a")]).toEqual({ x: 10, y: 20 });
    expect(current?.generation).toBe(before.view.nextGeneration);
    expect(next.view.history).toEqual([]);
    expect(next.fit).toEqual({ token: before.fit.token + 1, duration: 0 });
  });

  it("clears the error and the transient fields", () => {
    const dirty: AppState = {
      ...twoGraphs(),
      error: "boom",
      loading: [id("s")],
      failures: { [id("s")]: { message: "x", token: 3 } },
      entering: { ids: [id("s")], token: 4 },
      reveal: { token: 4, rect: { x: 0, y: 0, width: 1, height: 1 } },
    };
    const next = reduceApp(dirty, { type: "back" });
    expect(next.error).toBeUndefined();
    expect(next.loading).toEqual([]);
    expect(next.failures).toEqual({});
    expect(next.entering.ids).toEqual([]);
    expect(next.reveal).toBeUndefined();
  });

  it("is ignored while a centre waits for ELK, which then commits normally", () => {
    const withPending = reduceApp(twoGraphs(), centre("c"));
    expect(withPending.busy).toBe(false);
    const back = reduceApp(withPending, { type: "back" });
    expect(back).toBe(withPending);
    const done = reduceApp(back, {
      type: "centreLaidOut",
      id: back.pending?.id ?? -1,
      positions: {},
    });
    expect(done.view.current?.focusId).toBe(id("c"));
    expect(done.pending).toBeUndefined();
  });

  it("ignores a late expansion answer for the generation it left", () => {
    const before = twoGraphs();
    const left = before.view.current;
    const back = reduceApp(before, { type: "back" });
    const late = reduceApp(back, {
      type: "slice",
      slice: sliceOf("s", ["t"]),
      project: PROJECT,
      mode: {
        kind: "expansion",
        nodeId: id("s"),
        generation: left?.generation ?? -1,
      },
    });
    expect(late).toBe(back);
  });

  it("does nothing on an empty history", () => {
    const state = laidOut(createAppState(undefined), "a");
    expect(canGoBack(state.view)).toBe(false);
    expect(reduceApp(state, { type: "back" })).toBe(state);
  });

  it("does nothing while busy", () => {
    const busy = reduceApp(twoGraphs(), { type: "busy", busy: true });
    expect(reduceApp(busy, { type: "back" })).toBe(busy);
  });
});

describe("isWorking", () => {
  it("is true while busy or while a centre is pending, false otherwise", () => {
    const idle = createAppState(undefined);
    expect(isWorking(idle)).toBe(false);
    expect(isWorking(reduceApp(idle, { type: "busy", busy: true }))).toBe(true);
    const pending = reduceApp(idle, centre("a"));
    expect(pending.busy).toBe(false);
    expect(isWorking(pending)).toBe(true);
    expect(isWorking(laidOut(idle, "a"))).toBe(false);
  });
});

describe("columnGapChanged", () => {
  it("normalises and clamps and leaves positions alone", () => {
    const state = twoGraphs();
    const snapped = reduceApp(state, { type: "columnGapChanged", value: 100 });
    expect(snapped.view.columnGap).toBe(96);
    expect(snapped.view.current?.positions).toBe(state.view.current?.positions);
    expect(snapped.view.current).toBe(state.view.current);
    const low = reduceApp(state, { type: "columnGapChanged", value: 1 });
    const high = reduceApp(state, { type: "columnGapChanged", value: 9999 });
    expect(low.view.columnGap).toBe(32);
    expect(high.view.columnGap).toBe(480);
  });

  it("keeps the view restorable", () => {
    const state = reduceApp(twoGraphs(), {
      type: "columnGapChanged",
      value: 100,
    });
    expect(isViewState(state.view)).toBe(true);
  });
});

describe("settings", () => {
  it("starts unapplied", () => {
    expect(createAppState(undefined).settingsApplied).toBe(false);
  });

  it("applies the first one, normalised, without a fit", () => {
    const state = twoGraphs();
    const next = reduceApp(state, { type: "settings", columnGap: 100 });
    expect(next.view.columnGap).toBe(96);
    expect(next.settingsApplied).toBe(true);
    expect(next.fit).toBe(state.fit);
    expect(next.view.current).toBe(state.view.current);
    expect(isViewState(next.view)).toBe(true);
  });

  it("ignores later ones", () => {
    const first = reduceApp(twoGraphs(), { type: "settings", columnGap: 128 });
    const again = reduceApp(first, { type: "settings", columnGap: 256 });
    expect(again).toBe(first);
    expect(again.view.columnGap).toBe(128);
  });

  it("is not persisted with the view", () => {
    const applied = reduceApp(createAppState(undefined), {
      type: "settings",
      columnGap: 128,
    });
    expect(createAppState(applied.view).settingsApplied).toBe(false);
  });
});

describe("a centre laid out while the slider settles", () => {
  it("is laid out again at the current gap", () => {
    const shown = laidOut(createAppState(undefined), "a");
    const waiting = reduceApp(shown, centre("b", ["s"]));
    const moved = reduceApp(waiting, { type: "columnGapChanged", value: 96 });
    const first = moved.pending;
    const next = reduceApp(moved, {
      type: "centreLaidOut",
      id: first?.id ?? -1,
      positions: { [id("b")]: { x: 1, y: 1 } },
    });
    expect(next.view).toBe(moved.view);
    expect(next.fit).toBe(moved.fit);
    expect(next.pending?.id).not.toBe(first?.id);
    expect(next.pending?.columnGap).toBe(96);
    expect(next.pending?.graph).toBe(first?.graph);
    const done = reduceApp(next, {
      type: "centreLaidOut",
      id: next.pending?.id ?? -1,
      positions: { [id("b")]: { x: 2, y: 2 } },
    });
    expect(done.pending).toBeUndefined();
    expect(done.view.current?.focusId).toBe(id("b"));
    expect(done.view.current?.positions[id("b")]).toEqual({ x: 2, y: 2 });
    expect(done.view.current?.columnGap).toBe(96);
  });

  it("requests nothing extra when the gap did not change", () => {
    const waiting = reduceApp(createAppState(undefined), centre("a"));
    const done = reduceApp(waiting, {
      type: "centreLaidOut",
      id: waiting.pending?.id ?? -1,
      positions: {},
    });
    expect(done.pending).toBeUndefined();
    expect(done.view.current?.focusId).toBe(id("a"));
    expect(done.view.current?.columnGap).toBe(192);
  });
});

describe("the gap a graph was laid out with", () => {
  it("is replaced by Tidy with the gap Tidy used, and by nothing else", () => {
    const shown = laidOut(createAppState(undefined), "a");
    const moved = reduceApp(shown, { type: "columnGapChanged", value: 480 });
    expect(moved.view.current?.columnGap).toBe(192);
    const tidied = reduceApp(moved, {
      type: "tidied",
      generation: moved.view.current?.generation ?? -1,
      columnGap: 480,
      positions: { [id("a")]: { x: 3, y: 4 } },
    });
    expect(tidied.view.current?.columnGap).toBe(480);
    expect(isViewState(tidied.view)).toBe(true);
  });

  it("comes back with a graph restored by Back, while the slider keeps its value", () => {
    const first = laidOut(createAppState(undefined), "a");
    const moved = reduceApp(first, { type: "columnGapChanged", value: 480 });
    const second = laidOut(moved, "b");
    expect(second.view.current?.columnGap).toBe(480);
    const back = reduceApp(second, { type: "back" });
    expect(back.view.current?.columnGap).toBe(192);
    expect(back.view.columnGap).toBe(480);
  });
});
