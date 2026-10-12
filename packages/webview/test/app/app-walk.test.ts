import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../../src/app/app-state.js";
import { resetTransient } from "../../src/app/app-walk.js";
import { id, PROJECT, sliceOf } from "../support/graph-states.js";

const positions = {
  [id("a")]: { x: 1000, y: 500 },
  [id("b")]: { x: 488, y: 1500 },
};

function showing(): AppState {
  const pending = reduceApp(createAppState(undefined), {
    type: "slice",
    slice: sliceOf("a", ["b"]),
    project: PROJECT,
    mode: { kind: "centre", sourceVersion: 0 },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions,
  });
}

const answer = (generation = 1, supplier = "d"): AppAction => ({
  type: "slice",
  slice: sliceOf("b", [supplier], ["a"]),
  project: PROJECT,
  mode: { kind: "expansion", nodeId: id("b"), generation },
});

const started = (state: AppState) =>
  reduceApp(state, { type: "expandStarted", nodeId: id("b") });

describe("expandStarted", () => {
  it("marks a node loading once", () => {
    const once = started(showing());
    expect(once.loading).toEqual([id("b")]);
    expect(started(once)).toBe(once);
  });

  it("forgets an earlier failure of that node", () => {
    const failed = reduceApp(started(showing()), {
      type: "expandFailed",
      nodeId: id("b"),
      generation: 1,
      message: "gone",
    });
    expect(started(failed).failures).toEqual({});
  });
});

describe("an accepted expansion answer", () => {
  it("merges, clears loading and sets entering and reveal", () => {
    const next = reduceApp(started(showing()), answer());
    expect(Object.keys(next.view.current?.nodes ?? {})).toContain(id("d"));
    expect(next.loading).toEqual([]);
    expect(next.entering.ids).toEqual([id("d")]);
    expect(next.entering.token).toBeGreaterThan(0);
    expect(next.reveal?.token).toBe(next.entering.token);
    const at = next.view.current?.positions[id("d")];
    expect(next.reveal?.rect).toMatchObject(at ?? {});
    expect(next.nextToken).toBeGreaterThan(next.entering.token);
  });

  it("clears loading and sets neither when it adds no node", () => {
    const before = started(showing());
    const next = reduceApp(before, {
      type: "slice",
      slice: sliceOf("b", [], ["a"]),
      project: PROJECT,
      mode: { kind: "expansion", nodeId: id("b"), generation: 1 },
    });
    expect(next.loading).toEqual([]);
    expect(next.entering).toBe(before.entering);
    expect(next.reveal).toBeUndefined();
  });

  it("changes nothing for another generation, loading included", () => {
    const before = started(showing());
    expect(reduceApp(before, answer(9))).toBe(before);
  });
});

describe("expandFailed", () => {
  const failure = (generation: number): AppAction => ({
    type: "expandFailed",
    nodeId: id("b"),
    generation,
    message: "gone",
  });

  it("records a failure and clears loading for the current generation", () => {
    const before = started(showing());
    const next = reduceApp(before, failure(1));
    expect(next.loading).toEqual([]);
    expect(next.failures[id("b")]?.message).toBe("gone");
    expect(next.failures[id("b")]?.token).toBeGreaterThan(0);
    expect(next.view).toBe(before.view);
  });

  it("is dropped for any other generation", () => {
    const before = started(showing());
    expect(reduceApp(before, failure(2))).toBe(before);
  });

  it("is dropped for a node that left the graph", () => {
    const expanded = reduceApp(started(showing()), answer());
    const gone = reduceApp(expanded, { type: "collapsed", nodeId: id("b") });
    const withD = reduceApp(expanded, {
      type: "expandStarted",
      nodeId: id("d"),
    });
    const collapsed = reduceApp(withD, { type: "collapsed", nodeId: id("b") });
    expect(gone.view.current?.nodes[id("d")]).toBeUndefined();
    expect(
      reduceApp(collapsed, {
        type: "expandFailed",
        nodeId: id("d"),
        generation: 1,
        message: "late",
      }),
    ).toBe(collapsed);
  });
});

describe("expiry actions", () => {
  it("failureExpired acts only on a matching token", () => {
    const failed = reduceApp(started(showing()), {
      type: "expandFailed",
      nodeId: id("b"),
      generation: 1,
      message: "gone",
    });
    const token = failed.failures[id("b")]?.token ?? -1;
    expect(
      reduceApp(failed, { type: "failureExpired", nodeId: id("b"), token: 99 }),
    ).toBe(failed);
    expect(
      reduceApp(failed, { type: "failureExpired", nodeId: id("b"), token })
        .failures,
    ).toEqual({});
  });

  it("enteringExpired acts only on a matching token", () => {
    const entered = reduceApp(started(showing()), answer());
    const { token } = entered.entering;
    expect(reduceApp(entered, { type: "enteringExpired", token: 99 })).toBe(
      entered,
    );
    expect(
      reduceApp(entered, { type: "enteringExpired", token }).entering.ids,
    ).toEqual([]);
  });

  it("a later failure outlives the timer of an earlier one", () => {
    const first = reduceApp(started(showing()), {
      type: "expandFailed",
      nodeId: id("b"),
      generation: 1,
      message: "one",
    });
    const oldToken = first.failures[id("b")]?.token ?? -1;
    const second = reduceApp(started(first), {
      type: "expandFailed",
      nodeId: id("b"),
      generation: 1,
      message: "two",
    });
    const next = reduceApp(second, {
      type: "failureExpired",
      nodeId: id("b"),
      token: oldToken,
    });
    expect(next.failures[id("b")]?.message).toBe("two");
  });
});

describe("collapsed", () => {
  it("collapses and drops loading and failures of removed nodes", () => {
    const expanded = reduceApp(started(showing()), answer());
    const withState: AppState = {
      ...expanded,
      loading: [id("d"), id("b")],
      failures: {
        [id("d")]: { message: "x", token: 50 },
        [id("a")]: { message: "y", token: 51 },
      },
    };
    const next = reduceApp(withState, { type: "collapsed", nodeId: id("b") });
    expect(Object.keys(next.view.current?.nodes ?? {})).not.toContain(id("d"));
    expect(next.loading).toEqual([id("b")]);
    expect(Object.keys(next.failures)).toEqual([id("a")]);
  });

  it("leaves a collapsed box alone", () => {
    const before = showing();
    expect(reduceApp(before, { type: "collapsed", nodeId: id("b") })).toBe(
      before,
    );
  });
});

describe("unpinned", () => {
  it("unpins and keeps the position", () => {
    const pinned = reduceApp(showing(), {
      type: "dragStopped",
      positions: { [id("b")]: { x: 12, y: 34 } },
    });
    const next = reduceApp(pinned, { type: "unpinned", nodeId: id("b") });
    expect(next.view.current?.pinned).toEqual([]);
    expect(next.view.current?.positions[id("b")]).toEqual({ x: 12, y: 34 });
  });
});

describe("a committed centre", () => {
  it("resets the transient fields", () => {
    const busy = reduceApp(started(showing()), answer());
    const dirty: AppState = {
      ...busy,
      loading: [id("b")],
      failures: { [id("b")]: { message: "x", token: 3 } },
    };
    const pending = reduceApp(dirty, {
      type: "slice",
      slice: sliceOf("z"),
      project: PROJECT,
      mode: { kind: "centre", sourceVersion: 0 },
    });
    const next = reduceApp(pending, {
      type: "centreLaidOut",
      id: pending.pending?.id ?? -1,
      positions: {},
    });
    expect(next.loading).toEqual([]);
    expect(next.failures).toEqual({});
    expect(next.entering.ids).toEqual([]);
    expect(next.reveal).toBeUndefined();
    expect(next.nextToken).toBe(dirty.nextToken);
  });

  it("resetTransient keeps the tokens counting up", () => {
    const state = reduceApp(started(showing()), answer());
    expect(resetTransient(state).nextToken).toBe(state.nextToken);
  });
});
