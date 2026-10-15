import { describe, expect, it } from "vitest";
import { isGraphState, isViewState } from "../../src/view/persist.js";
import { commitCentre, createView } from "../../src/view/view-state.js";
import { graphOf } from "../support/graph-states.js";
import { pathGraph } from "../support/path-graphs.js";
import { id } from "../support/graph-states.js";
import type { GraphState } from "../../src/view/types.js";

function viaJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function withPath(patch: object): GraphState {
  const graph = pathGraph();
  return { ...graph, path: { ...graph.path!, ...patch } };
}

describe("saving a path graph", () => {
  it("survives a save round trip through isViewState", () => {
    const first = commitCentre(createView(), graphOf("b", ["a"]));
    const view = commitCentre(first, pathGraph());
    const restored = viaJson(view);
    expect(isViewState(restored)).toBe(true);
    expect((restored as typeof view).current?.path).toEqual(
      view.current?.path,
    );
    expect(isGraphState(viaJson(pathGraph()))).toBe(true);
  });

  it("loads a save without path as before", () => {
    const view = commitCentre(createView(), graphOf("a", ["s"], ["m"]));
    expect(view.current?.path).toBeUndefined();
    expect(isViewState(viaJson(view))).toBe(true);
    expect(isGraphState(viaJson(graphOf("a")))).toBe(true);
  });

  it("rejects a bad path", () => {
    const boxes = pathGraph().path?.boxes ?? [];
    expect(isGraphState(withPath({ endId: id("nope") }))).toBe(false);
    const stray = { id: id("nope"), column: 5 };
    expect(isGraphState(withPath({ boxes: [...boxes, stray] }))).toBe(false);
    expect(isGraphState(withPath({ edgeIds: ["missing"] }))).toBe(false);
    expect(
      isGraphState(withPath({ boxes: boxes.filter((b) => b.id !== id("a")) })),
    ).toBe(false);
    expect(isGraphState(withPath({ boxes: "a" }))).toBe(false);
    expect(
      isGraphState(
        withPath({ summary: { routes: 1, routesCapped: false, checked: 1 } }),
      ),
    ).toBe(false);
  });
});
