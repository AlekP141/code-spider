import { describe, expect, it } from "vitest";
import { canRefresh } from "../src/app-refresh.js";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../src/app-state.js";
import {
  answerOf,
  id,
  PROJECT,
  sliceOf,
  tweakNode,
} from "./support/graph-states.js";

const positions = {
  [id("a")]: { x: 1000, y: 500 },
  [id("b")]: { x: 488, y: 1500 },
};

function showing(): AppState {
  const pending = reduceApp(createAppState(undefined), {
    type: "slice",
    slice: sliceOf("a", ["b"]),
    project: PROJECT,
    mode: { kind: "centre" },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions,
  });
}

const start = (state: AppState) =>
  reduceApp(state, { type: "refreshStarted" });

function refreshing(): AppState {
  return start(showing());
}

function graphOf(state: AppState) {
  const graph = state.view.current;
  if (!graph) throw new Error("no graph");
  return graph;
}

function answerFor(state: AppState, suppliers: string[] = ["b"]) {
  const slice = tweakNode(sliceOf("a", suppliers), "a", {
    returnType: "fresh",
  });
  return answerOf(graphOf(state), slice, [], 7);
}

describe("refreshStarted", () => {
  it("sets refreshing when allowed", () => {
    const before = showing();
    expect(canRefresh(before)).toBe(true);
    expect(start(before).refreshing).toBe(true);
  });

  it("is ignored with no graph", () => {
    const empty = createAppState(undefined);
    expect(canRefresh(empty)).toBe(false);
    expect(start(empty)).toBe(empty);
  });

  it("is ignored while busy or while a centre waits for ELK", () => {
    const busy = reduceApp(showing(), { type: "busy", busy: true });
    expect(canRefresh(busy)).toBe(false);
    expect(start(busy)).toBe(busy);
    const pending = reduceApp(showing(), {
      type: "slice",
      slice: sliceOf("c"),
      project: PROJECT,
      mode: { kind: "centre" },
    });
    expect(canRefresh(pending)).toBe(false);
    expect(start(pending)).toBe(pending);
  });

  it("is ignored while a box loads", () => {
    const loading = reduceApp(showing(), {
      type: "expandStarted",
      nodeId: id("b"),
    });
    expect(canRefresh(loading)).toBe(false);
    expect(start(loading)).toBe(loading);
  });

  it("is ignored when already refreshing", () => {
    const again = refreshing();
    expect(canRefresh(again)).toBe(false);
    expect(start(again)).toBe(again);
  });
});

describe("a matching refreshed answer", () => {
  it("shows new code, keeps positions and clears refreshing", () => {
    const before = refreshing();
    const next = reduceApp(before, answerFor(before));
    const graph = graphOf(next);
    expect(graph.nodes[id("a")]?.returnType).toBe("fresh");
    expect(graph.positions).toEqual(positions);
    expect(graph.revision).toBe(graphOf(before).revision + 1);
    expect(graph.sourceVersion).toBe(7);
    expect(next.refreshing).toBe(false);
  });

  it("leaves fit and reveal alone", () => {
    const before = refreshing();
    const next = reduceApp(before, answerFor(before, ["b", "c"]));
    expect(next.fit).toBe(before.fit);
    expect(next.reveal).toBe(before.reveal);
  });

  it("makes the added nodes enter under a new token", () => {
    const before = refreshing();
    const next = reduceApp(before, answerFor(before, ["b", "c"]));
    expect(next.entering.ids).toEqual([id("c")]);
    expect(next.entering.token).toBe(before.nextToken);
    expect(next.nextToken).toBe(before.nextToken + 1);
  });

  it("keeps ids still fading that are still in the graph", () => {
    const fading = { ...refreshing(), entering: { ids: [id("b")], token: 3 } };
    const next = reduceApp(fading, answerFor(fading, ["b", "c"]));
    expect(next.entering.ids).toEqual([id("b"), id("c")]);
  });

  it("leaves entering alone when it adds no node", () => {
    const before = refreshing();
    const next = reduceApp(before, answerFor(before));
    expect(next.entering).toBe(before.entering);
    expect(next.nextToken).toBe(before.nextToken);
  });

  it("keeps a box collapsed after refreshStarted collapsed", () => {
    const expanded = reduceApp(
      reduceApp(showing(), { type: "expandStarted", nodeId: id("b") }),
      {
        type: "slice",
        slice: sliceOf("b", ["d"], ["a"]),
        project: PROJECT,
        mode: { kind: "expansion", nodeId: id("b"), generation: 1 },
      },
    );
    const started = start(expanded);
    const collapsed = reduceApp(started, {
      type: "collapsed",
      nodeId: id("b"),
    });
    const answer = answerOf(graphOf(collapsed), sliceOf("a", ["b"]), [
      { nodeId: id("b"), slice: sliceOf("b", ["d"], ["a"]) },
    ]);
    const next = reduceApp(collapsed, answer);
    expect(Object.keys(graphOf(next).nodes)).not.toContain(id("d"));
  });
});

describe("a refreshed answer for something else", () => {
  it("is ignored for another generation", () => {
    const before = refreshing();
    const answer = { ...answerFor(before), generation: 9 };
    expect(reduceApp(before, answer)).toBe(before);
  });

  it("is ignored for another project", () => {
    const before = refreshing();
    const answer = { ...answerFor(before), project: "/other/tsconfig.json" };
    expect(reduceApp(before, answer)).toBe(before);
  });

  it("is ignored for another centre", () => {
    const before = refreshing();
    const other = answerOf(graphOf(before), sliceOf("z", ["b"]));
    expect(reduceApp(before, other)).toBe(before);
  });

  it("is ignored with no graph", () => {
    const state = createAppState(undefined);
    const answer = answerOf(graphOf(showing()), sliceOf("a", ["b"]));
    expect(reduceApp(state, answer)).toBe(state);
  });
});

describe("refreshFailed", () => {
  const failure = (generation: number): AppAction => ({
    type: "refreshFailed",
    generation,
    message: "gone",
  });

  it("sets the error, clears refreshing and keeps the graph", () => {
    const before = refreshing();
    const next = reduceApp(before, failure(graphOf(before).generation));
    expect(next.error).toBe("gone");
    expect(next.refreshing).toBe(false);
    expect(next.view).toBe(before.view);
  });

  it("is ignored for another generation", () => {
    const before = refreshing();
    expect(reduceApp(before, failure(9))).toBe(before);
  });
});

describe("clearing refreshing", () => {
  it("busy false clears it and busy true does not", () => {
    const before = refreshing();
    expect(reduceApp(before, { type: "busy", busy: true }).refreshing).toBe(
      true,
    );
    expect(reduceApp(before, { type: "busy", busy: false }).refreshing).toBe(
      false,
    );
  });

  it("a new centre clears it", () => {
    const before = refreshing();
    const pending = reduceApp(before, {
      type: "slice",
      slice: sliceOf("c"),
      project: PROJECT,
      mode: { kind: "centre" },
    });
    const next = reduceApp(pending, {
      type: "centreLaidOut",
      id: pending.pending?.id ?? -1,
      positions: { [id("c")]: { x: 0, y: 0 } },
    });
    expect(next.refreshing).toBe(false);
  });

  it("Back clears it", () => {
    const first = showing();
    const pending = reduceApp(first, {
      type: "slice",
      slice: sliceOf("c"),
      project: PROJECT,
      mode: { kind: "centre" },
    });
    const second = reduceApp(pending, {
      type: "centreLaidOut",
      id: pending.pending?.id ?? -1,
      positions: { [id("c")]: { x: 0, y: 0 } },
    });
    const next = reduceApp({ ...second, refreshing: true }, { type: "back" });
    expect(next.view.current?.focusId).toBe(id("a"));
    expect(next.refreshing).toBe(false);
  });
});
