import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import type { layoutGraph } from "../../src/graph/layout/layout.js";
import { tidyGraph } from "../../src/graph/layout/tidy-graph.js";
import { isClear } from "../../src/graph/layout/placement.js";
import { rowGap } from "../../src/settings/column-gap.js";
import type { TestVisibility } from "../../src/settings/test-visibility.js";
import { rectsOf } from "../../src/view/expansion.js";
import { hiddenIds, visibleGraph } from "../../src/view/test-visibility.js";
import { calledSlice, id, PROJECT } from "../support/graph-states.js";
import {
  current,
  markTests,
  PITCH,
  scenario,
} from "../support/hidden-graphs.js";

const flip = (state: AppState, value: TestVisibility) =>
  reduceApp(state, { type: "testVisibilityChanged", value });

const centreSlice = () => markTests(calledSlice("a", ["b"], ["t"]), "t");

function started(state: AppState): AppState {
  return reduceApp(state, {
    type: "slice",
    slice: centreSlice(),
    project: PROJECT,
    mode: { kind: "centre", sourceVersion: 0 },
  });
}

const visiblePositions = {
  [id("a")]: { x: 1000, y: 500 },
  [id("b")]: { x: 1000 - PITCH, y: 500 },
};

function pendingOf(state: AppState) {
  if (!state.pending) throw new Error("no pending centre");
  return state.pending;
}

describe("a pending centre and the test visibility", () => {
  it("records the setting a centre started with", () => {
    const hidden = flip(createAppState(undefined), "hide");
    expect(pendingOf(started(hidden)).testVisibility).toBe("hide");
    expect(pendingOf(started(createAppState(undefined))).testVisibility).toBe(
      "show",
    );
  });

  it("commits positions for the visible boxes only when laid out while hiding", () => {
    const pending = started(flip(createAppState(undefined), "hide"));
    const done = reduceApp(pending, {
      type: "centreLaidOut",
      id: pendingOf(pending).id,
      positions: visiblePositions,
    });
    const graph = current(done);
    expect(Object.keys(graph.positions).sort()).toEqual(
      [id("a"), id("b")].sort(),
    );
    expect(graph.nodes[id("t")]).toBeDefined();
  });

  it.each([
    ["show", "hide"],
    ["hide", "show"],
  ] as const)(
    "discards an answer laid out under %s after a flip to %s and lays the centre out again",
    (from, to) => {
      const pending = started(flip(createAppState(undefined), from));
      const first = pendingOf(pending);
      const flipped = flip(pending, to);
      const answered = reduceApp(flipped, {
        type: "centreLaidOut",
        id: first.id,
        positions: visiblePositions,
      });
      expect(answered.view.current).toBeUndefined();
      const again = pendingOf(answered);
      expect(again.id).not.toBe(first.id);
      expect(again.testVisibility).toBe(to);
      const done = reduceApp(answered, {
        type: "centreLaidOut",
        id: again.id,
        positions: visiblePositions,
      });
      expect(current(done).positions[id("a")]).toEqual(
        visiblePositions[id("a")],
      );
      expect(done.pending).toBeUndefined();
    },
  );

  it("commits an answer laid out under the setting still in force", () => {
    const pending = started(flip(createAppState(undefined), "hide"));
    const sameAgain = flip(pending, "hide");
    const done = reduceApp(sameAgain, {
      type: "centreLaidOut",
      id: pendingOf(sameAgain).id,
      positions: visiblePositions,
    });
    expect(done.pending).toBeUndefined();
    expect(done.view.current).toBeDefined();
  });
});

describe("Tidy while hiding", () => {
  const column: typeof layoutGraph = async (graph) =>
    Object.fromEntries(
      Object.keys(graph.nodes).map((nodeId, index) => [
        nodeId,
        { x: 0, y: index * 400 },
      ]),
    );

  async function tidiedWhileHidden() {
    const hidden = flip(scenario(), "hide");
    const outcome = await tidyGraph(
      () => {
        const graph = hidden.view.current;
        return graph && visibleGraph(graph, hiddenIds(graph, "hide"));
      },
      () => 192,
      column,
    );
    if (!outcome) throw new Error("no tidy outcome");
    return reduceApp(hidden, { type: "tidied", ...outcome });
  }

  it("moves visible boxes only and leaves hidden boxes without a position", async () => {
    const tidied = await tidiedWhileHidden();
    const graph = current(tidied);
    expect(Object.keys(graph.positions).sort()).toEqual(
      [id("a"), id("b")].sort(),
    );
    expect(graph.positions[id("a")]?.x).toBe(0);
  });

  it("places the boxes that return clear of every tidied box", async () => {
    const shown = flip(await tidiedWhileHidden(), "show");
    const graph = current(shown);
    expect(Object.keys(graph.positions)).toHaveLength(4);
    const rects = rectsOf(graph);
    for (const [index, rect] of rects.entries()) {
      for (const other of rects.slice(index + 1)) {
        expect(isClear(rect, other, rowGap(192))).toBe(true);
      }
    }
  });
});
