import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import type { TestVisibility } from "../../src/settings/test-visibility.js";
import { isViewState } from "../../src/view/persist.js";
import {
  answerOf,
  calledSlice,
  id,
  nodeIds,
  sliceOf,
} from "../support/graph-states.js";
import {
  centreOf,
  current,
  expandedWith,
  markTests,
  PITCH,
  scenario,
} from "../support/hidden-graphs.js";

const flip = (state: AppState, value: TestVisibility) =>
  reduceApp(state, { type: "testVisibilityChanged", value });

const hide = (state: AppState) => flip(state, "hide");
const show = (state: AppState) => flip(state, "show");

function dragged(state: AppState): AppState {
  return reduceApp(state, {
    type: "dragStopped",
    positions: {
      [id("t")]: { x: 3000, y: 2000 },
      [id("u")]: { x: 3600, y: 2400 },
    },
  });
}

function prepared(): AppState {
  let state = dragged(scenario());
  for (const name of ["t", "u"]) {
    state = reduceApp(state, { type: "nodeOpened", nodeId: id(name) });
  }
  return state;
}

function withHistory(): AppState {
  return centreOf(prepared(), sliceOf("z"), { [id("z")]: { x: 0, y: 0 } });
}

const noEntering = (state: AppState) =>
  reduceApp(state, { type: "enteringExpired", token: state.entering.token });

describe("testVisibilityChanged", () => {
  it("starts a new app showing tests", () => {
    expect(createAppState(undefined).testVisibility).toBe("show");
  });

  it("sets the value", () => {
    expect(hide(scenario()).testVisibility).toBe("hide");
    expect(show(hide(scenario())).testVisibility).toBe("show");
  });

  it("returns the very same state for the value already in use with nothing to change", () => {
    const state = scenario();
    expect(show(state)).toBe(state);
    const hidden = hide(state);
    expect(hide(hidden)).toBe(hidden);
  });

  it("raises the current graph's revision and changes no node or edge", () => {
    const before = current(scenario());
    const after = current(hide(scenario()));
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.nodes).toEqual(before.nodes);
    expect(after.edges).toEqual(before.edges);
    const flipped = current(show(hide(scenario())));
    expect(flipped.revision).toBeGreaterThan(after.revision);
    const bare = centreOf(createAppState(undefined), sliceOf("a", ["b"]), {
      [id("a")]: { x: 0, y: 0 },
      [id("b")]: { x: -PITCH, y: 0 },
    });
    expect(current(hide(bare)).revision).toBe(current(bare).revision + 1);
  });

  it("leaves the position, pin and open state of every visible box as they were", () => {
    const before = current(prepared());
    const after = current(hide(prepared()));
    for (const name of ["a", "b"]) {
      expect(after.positions[id(name)]).toEqual(before.positions[id(name)]);
    }
    expect(after.open).toContain(id("a"));
    expect(after.pinned).toEqual([]);
  });

  it("drops the position, pin and open entry of every hidden box, in the current graph and in the history", () => {
    const state = withHistory();
    const before = state.view.history[0];
    expect(before?.pinned).toEqual([id("t"), id("u")]);
    const hidden = hide(state);
    expect(hidden.view.history).toHaveLength(1);
    for (const graph of hidden.view.history) {
      for (const name of ["t", "u"]) {
        expect(graph.nodes[id(name)]).toBeDefined();
        expect(graph.positions[id(name)]).toBeUndefined();
        expect(graph.pinned).not.toContain(id(name));
        expect(graph.open).not.toContain(id(name));
      }
    }
    expect(hidden.view.history[0]?.positions[id("a")]).toEqual(
      before?.positions[id("a")],
    );
  });

  it("makes a pinned test box lose its pin when hidden, and leaves it unpinned when shown", () => {
    const pinned = dragged(scenario());
    expect(current(pinned).pinned).toContain(id("t"));
    const hidden = hide(pinned);
    expect(current(hidden).pinned).not.toContain(id("t"));
    expect(current(show(hidden)).pinned).not.toContain(id("t"));
  });

  it("brings an open test box back closed", () => {
    const opened = reduceApp(scenario(), {
      type: "nodeOpened",
      nodeId: id("t"),
    });
    expect(current(opened).open).toContain(id("t"));
    const back = show(hide(opened));
    expect(current(back).open).not.toContain(id("t"));
  });

  it("places a box hidden then shown fresh beside its owner, not at its old position", () => {
    const old = current(dragged(scenario())).positions[id("t")];
    expect(old).toEqual({ x: 3000, y: 2000 });
    const shown = current(show(hide(dragged(scenario()))));
    const at = shown.positions[id("t")];
    expect(at?.x).toBe(1000 + PITCH);
    expect(at).not.toEqual(old);
  });

  it("places the hidden boxes of the current graph and of the history when showing", () => {
    const shown = show(hide(withHistory()));
    expect(shown.view.history).toHaveLength(1);
    for (const graph of [current(shown), ...shown.view.history]) {
      for (const nodeId of nodeIds(graph)) {
        expect(graph.positions[nodeId]).toBeDefined();
      }
    }
  });

  it("gives test boxes placed fresh when Back reaches a history graph after a hide and a show", () => {
    const shown = show(hide(withHistory()));
    const back = reduceApp(shown, { type: "back" });
    const graph = current(back);
    expect(graph.focusId).toBe(id("a"));
    for (const nodeId of nodeIds(graph)) {
      expect(graph.positions[nodeId]).toBeDefined();
    }
    expect(graph.positions[id("t")]).not.toEqual({ x: 3000, y: 2000 });
  });

  it("places nothing more when showing again", () => {
    const shown = show(hide(scenario()));
    expect(show(shown)).toBe(shown);
  });

  it("is not part of the view", () => {
    const next = hide(scenario());
    expect(isViewState(next.view)).toBe(true);
    expect("testVisibility" in next.view).toBe(false);
    expect(createAppState(next.view).testVisibility).toBe("show");
  });
});

describe("expansion and refresh answers while hiding", () => {
  it("leaves a new test box positionless and fades in only the placed boxes", () => {
    const hidden = noEntering(hide(scenario()));
    const slice = markTests(calledSlice("b", ["p", "tt"]), "tt");
    const answered = expandedWith(hidden, id("b"), slice);
    const graph = current(answered);
    expect(graph.nodes[id("tt")]).toBeDefined();
    expect(graph.positions[id("tt")]).toBeUndefined();
    expect(graph.positions[id("p")]).toBeDefined();
    expect(answered.entering.ids).toEqual([id("p")]);
    expect(answered.reveal).toBeDefined();
  });

  it("places and fades in nothing for an expansion answer whose box is hidden in the meantime", () => {
    const started = reduceApp(scenario(), {
      type: "expandStarted",
      nodeId: id("u"),
    });
    const hidden = hide(started);
    const answered = expandedWith(hidden, id("u"), calledSlice("u", ["v"]));
    expect(current(answered).nodes[id("v")]).toBeDefined();
    expect(current(answered).positions[id("v")]).toBeUndefined();
    expect(answered.entering).toEqual(hidden.entering);
    expect(answered.reveal).toBe(hidden.reveal);
    expect(answered.loading).not.toContain(id("u"));
  });

  it("does not fade in a new test box on a refresh answer", () => {
    const hidden = noEntering(hide(scenario()));
    const centre = markTests(
      calledSlice("a", ["b", "n"], ["t", "tt"]),
      "t",
      "tt",
    );
    const refreshed = reduceApp(
      hidden,
      answerOf(current(hidden), centre),
    );
    expect(current(refreshed).positions[id("tt")]).toBeUndefined();
    expect(current(refreshed).positions[id("n")]).toBeDefined();
    expect(refreshed.entering.ids).toEqual([id("n")]);
  });
});

describe("collapse while hiding", () => {
  function pinnedBelowB(visibility: TestVisibility): AppState {
    const started = flip(scenario(), visibility);
    const expanded = expandedWith(started, id("b"), calledSlice("b", ["w"]));
    const pinned = reduceApp(expanded, {
      type: "dragStopped",
      positions: { [id("w")]: { x: 200, y: 200 } },
    });
    return reduceApp(pinned, { type: "collapsed", nodeId: id("b") });
  }

  it("forgets a pinned box left with no path to the centre", () => {
    const graph = current(pinnedBelowB("hide"));
    expect(graph.nodes[id("w")]).toBeDefined();
    expect(graph.positions[id("w")]).toBeUndefined();
    expect(graph.pinned).not.toContain(id("w"));
    const shown = current(pinnedBelowB("show"));
    expect(shown.positions[id("w")]).toEqual({ x: 200, y: 200 });
    expect(shown.pinned).toContain(id("w"));
  });
});
