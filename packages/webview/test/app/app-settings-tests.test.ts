import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import type { TestVisibility } from "../../src/settings/test-visibility.js";
import { id, nodeIds } from "../support/graph-states.js";
import { current, scenario } from "../support/hidden-graphs.js";

const settings = (testVisibility: unknown) =>
  ({
    type: "settings",
    columnGap: 192,
    edgeStyle: "stepped",
    diffMode: "uncommitted",
    testVisibility: testVisibility as TestVisibility,
  }) as const;

function restored(prepare: (state: AppState) => AppState): AppState {
  return createAppState(prepare(scenario()).view);
}

const flip = (state: AppState, value: TestVisibility) =>
  reduceApp(state, { type: "testVisibilityChanged", value });

describe("the first settings message and the test visibility", () => {
  it("applies it, normalised, and ignores later ones", () => {
    const first = reduceApp(scenario(), settings("hide"));
    expect(first.testVisibility).toBe("hide");
    expect(first.settingsApplied).toBe(true);
    expect(reduceApp(first, settings("show"))).toBe(first);
    expect(reduceApp(scenario(), settings("fade")).testVisibility).toBe("show");
  });

  it("places the boxes of a restored view that have no position when it shows tests", () => {
    const state = restored((shown) => flip(shown, "hide"));
    expect(current(state).positions[id("t")]).toBeUndefined();
    const next = reduceApp(state, settings("show"));
    const graph = current(next);
    for (const nodeId of nodeIds(graph)) {
      expect(graph.positions[nodeId]).toBeDefined();
    }
  });

  it("drops the position, pin and open entry of the hidden boxes of a restored view when it hides tests", () => {
    const state = restored((shown) => {
      const dragged = reduceApp(shown, {
        type: "dragStopped",
        positions: { [id("t")]: { x: 3000, y: 2000 } },
      });
      return reduceApp(dragged, { type: "nodeOpened", nodeId: id("t") });
    });
    expect(current(state).pinned).toContain(id("t"));
    expect(current(state).open).toContain(id("t"));
    const graph = current(reduceApp(state, settings("hide")));
    for (const name of ["t", "u"]) {
      expect(graph.nodes[id(name)]).toBeDefined();
      expect(graph.positions[id(name)]).toBeUndefined();
      expect(graph.pinned).not.toContain(id(name));
      expect(graph.open ?? []).not.toContain(id(name));
    }
    expect(graph.positions[id("a")]).toBeDefined();
  });
});
