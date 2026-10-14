import { describe, expect, it } from "vitest";
import { applyChangeMarks } from "../../src/app/app-change-marks.js";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../../src/app/app-state.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import { isViewState } from "../../src/view/persist.js";
import type { GraphState } from "../../src/view/types.js";
import { id, PROJECT, sliceOf } from "../support/graph-states.js";

const OTHER = "/other/tsconfig.json";

const centre = (focus: string): AppAction => ({
  type: "slice",
  slice: sliceOf(focus, ["s"]),
  project: PROJECT,
  mode: { kind: "centre", sourceVersion: 0 },
});

function laidOut(state: AppState, focus: string): AppState {
  const pending = reduceApp(state, centre(focus));
  if (!pending.pending) throw new Error("nothing is pending");
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending.id,
    positions: { [id(focus)]: { x: 10, y: 20 }, [id("s")]: { x: 0, y: 0 } },
  });
}

/** Shows `b` with `a` in the history. */
function twoGraphs(): AppState {
  return laidOut(laidOut(createAppState(undefined), "a"), "b");
}

const marks = { [id("s")]: "added" } as const;

const changeOf = (graph: GraphState | undefined, name: string) =>
  graph?.nodes[id(name)]?.change;

describe("applyChangeMarks", () => {
  it("recolours the current graph of the message's project", () => {
    const state = twoGraphs();
    const next = applyChangeMarks(state, { project: PROJECT, marks });
    expect(changeOf(next.view.current, "s")).toBe("added");
    expect(changeOf(next.view.current, "b")).toBeUndefined();
  });

  it("recolours the history and the pending centre of that project only", () => {
    const state = twoGraphs();
    const other = graphFromSlice(sliceOf("o", ["s"]), OTHER);
    const withOther: AppState = {
      ...reduceApp(state, centre("p")),
      view: { ...state.view, history: [...state.view.history, other] },
    };
    const pendingId = withOther.pending?.id;
    const next = applyChangeMarks(withOther, { project: PROJECT, marks });
    expect(changeOf(next.view.history[0], "s")).toBe("added");
    expect(changeOf(next.view.history[1], "s")).toBeUndefined();
    expect(next.view.history[1]).toBe(other);
    expect(changeOf(next.pending?.graph, "s")).toBe("added");
    expect(next.pending?.id).toBe(pendingId);
    expect(next.pending?.columnGap).toBe(withOther.pending?.columnGap);
  });

  it("returns the very same state when no node differs", () => {
    const state = twoGraphs();
    const none = { project: PROJECT, marks: {} };
    expect(applyChangeMarks(state, none)).toBe(state);
    expect(applyChangeMarks(state, { project: OTHER, marks })).toBe(state);
    const marked = applyChangeMarks(state, { project: PROJECT, marks });
    expect(applyChangeMarks(marked, { project: PROJECT, marks })).toBe(marked);
    const empty = createAppState(undefined);
    expect(applyChangeMarks(empty, { project: PROJECT, marks })).toBe(empty);
  });

  it("works while busy, loading and refreshing", () => {
    const state: AppState = {
      ...twoGraphs(),
      busy: true,
      loading: [id("s")],
      refreshing: true,
    };
    const next = applyChangeMarks(state, { project: PROJECT, marks });
    expect(changeOf(next.view.current, "s")).toBe("added");
    expect(next.busy).toBe(true);
    expect(next.loading).toEqual([id("s")]);
    expect(next.refreshing).toBe(true);
  });

  it("moves no box and keeps the view restorable", () => {
    const state = twoGraphs();
    const next = reduceApp(state, {
      type: "changeMarks",
      project: PROJECT,
      marks,
    });
    expect(next.view.current?.positions).toBe(state.view.current?.positions);
    expect(next.view.current?.revision).toBe(state.view.current?.revision);
    expect(next.view.current?.generation).toBe(state.view.current?.generation);
    expect(next.fit).toBe(state.fit);
    expect(next.entering).toBe(state.entering);
    expect(next.reveal).toBe(state.reveal);
    expect(isViewState(next.view)).toBe(true);
  });
});
