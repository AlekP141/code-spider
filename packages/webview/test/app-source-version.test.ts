import { describe, expect, it } from "vitest";
import { showsChangeDot } from "../src/app-refresh.js";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../src/app-state.js";
import { resetTransient } from "../src/app-walk.js";
import {
  answerOf,
  id,
  PROJECT,
  sliceOf,
  tweakNode,
} from "./support/graph-states.js";

const run = (state: AppState, ...actions: AppAction[]) =>
  actions.reduce(reduceApp, state);

function showing(sourceVersion: number, focus = "a"): AppState {
  const pending = reduceApp(createAppState(undefined), {
    type: "slice",
    slice: sliceOf(focus, ["b"]),
    project: PROJECT,
    mode: { kind: "centre", sourceVersion },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions: { [id(focus)]: { x: 0, y: 0 }, [id("b")]: { x: 400, y: 0 } },
  });
}

const changed = (version: number): AppAction => ({
  type: "sourceChanged",
  version,
});

function graphOf(state: AppState) {
  const graph = state.view.current;
  if (!graph) throw new Error("no graph");
  return graph;
}

describe("sourceChanged", () => {
  it("stores the version", () => {
    const state = reduceApp(createAppState(undefined), changed(3));
    expect(state.latestSourceVersion).toBe(3);
  });

  it("keeps the larger version when an older one arrives", () => {
    const state = run(createAppState(undefined), changed(5), changed(2));
    expect(state.latestSourceVersion).toBe(5);
    expect(reduceApp(state, changed(6)).latestSourceVersion).toBe(6);
  });

  it("starts undefined and survives resetTransient", () => {
    expect(createAppState(undefined).latestSourceVersion).toBeUndefined();
    const state = reduceApp(showing(1), changed(4));
    expect(resetTransient(state).latestSourceVersion).toBe(4);
  });
});

describe("the graph's source version", () => {
  it("is taken from the centre slice's mode", () => {
    expect(graphOf(showing(7)).sourceVersion).toBe(7);
  });

  it("is left alone by an expansion answer", () => {
    const state = showing(7);
    const next = reduceApp(state, {
      type: "slice",
      slice: sliceOf("b", ["c"]),
      project: PROJECT,
      mode: { kind: "expansion", nodeId: id("b"), generation: 1 },
    });
    expect(next.view.current?.nodes[id("c")]).toBeDefined();
    expect(graphOf(next).sourceVersion).toBe(7);
  });

  it("is restored by Back with the value the older graph was drawn at", () => {
    const first = showing(2, "a");
    const second = run(
      first,
      {
        type: "slice",
        slice: sliceOf("z"),
        project: PROJECT,
        mode: { kind: "centre", sourceVersion: 9 },
      },
      {
        type: "centreLaidOut",
        id: 2,
        positions: { [id("z")]: { x: 0, y: 0 } },
      },
    );
    expect(graphOf(second).sourceVersion).toBe(9);
    expect(graphOf(reduceApp(second, { type: "back" })).sourceVersion).toBe(2);
  });
});

describe("a centre laid out again after the slider moved", () => {
  it("still commits with the slice's source version", () => {
    const waiting = reduceApp(createAppState(undefined), {
      type: "slice",
      slice: sliceOf("a"),
      project: PROJECT,
      mode: { kind: "centre", sourceVersion: 7 },
    });
    const moved = reduceApp(waiting, { type: "columnGapChanged", value: 96 });
    const again = reduceApp(moved, {
      type: "centreLaidOut",
      id: waiting.pending?.id ?? -1,
      positions: { [id("a")]: { x: 0, y: 0 } },
    });
    expect(again.pending?.id).not.toBe(waiting.pending?.id);
    const done = reduceApp(again, {
      type: "centreLaidOut",
      id: again.pending?.id ?? -1,
      positions: { [id("a")]: { x: 1, y: 1 } },
    });
    expect(graphOf(done).sourceVersion).toBe(7);
  });
});

describe("showsChangeDot", () => {
  const view = (sourceVersion: number | undefined) => {
    const { view: shown } = showing(0);
    const current = shown.current;
    if (!current) throw new Error("no graph");
    return {
      ...shown,
      current: { ...current, sourceVersion },
    };
  };

  it("is false with no graph", () => {
    expect(
      showsChangeDot({ ...createAppState(undefined), latestSourceVersion: 5 }),
    ).toBe(false);
  });

  it("is false when the graph has no version", () => {
    expect(
      showsChangeDot({ view: view(undefined), latestSourceVersion: 5 }),
    ).toBe(false);
  });

  it("is false when nothing has changed", () => {
    expect(
      showsChangeDot({ view: view(2), latestSourceVersion: undefined }),
    ).toBe(false);
  });

  it("is false for equal versions and for a newer graph", () => {
    expect(showsChangeDot({ view: view(4), latestSourceVersion: 4 })).toBe(
      false,
    );
    expect(showsChangeDot({ view: view(5), latestSourceVersion: 4 })).toBe(
      false,
    );
  });

  it("is true when the graph is older than the latest change", () => {
    expect(showsChangeDot({ view: view(3), latestSourceVersion: 4 })).toBe(
      true,
    );
    expect(showsChangeDot({ view: view(0), latestSourceVersion: 1 })).toBe(
      true,
    );
  });

  it("is true for a freshly drawn graph once a change arrives", () => {
    const state = reduceApp(showing(1), changed(2));
    expect(showsChangeDot(state)).toBe(true);
  });
});

describe("a refreshed answer", () => {
  it("clears the dot when it carries the newer version", () => {
    const lit = reduceApp(showing(1), changed(3));
    expect(showsChangeDot(lit)).toBe(true);
    const slice = tweakNode(sliceOf("a", ["b"]), "a", { returnType: "fresh" });
    const next = run(
      lit,
      { type: "refreshStarted" },
      answerOf(graphOf(lit), slice, [], 3),
    );
    expect(graphOf(next).sourceVersion).toBe(3);
    expect(next.latestSourceVersion).toBe(3);
    expect(showsChangeDot(next)).toBe(false);
  });

  it("keeps the dot when a later change outruns the answer", () => {
    const lit = reduceApp(showing(1), changed(4));
    const next = run(
      lit,
      { type: "refreshStarted" },
      answerOf(graphOf(lit), sliceOf("a", ["b"]), [], 3),
    );
    expect(showsChangeDot(next)).toBe(true);
  });
});
