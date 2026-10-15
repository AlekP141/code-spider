import { describe, expect, it } from "vitest";
import { mergeExpansion } from "../../src/view/graph-state.js";
import { commitCentre, createView, goBack } from "../../src/view/view-state.js";
import { graphOf, id, sliceOf } from "../support/graph-states.js";
import { pathGraph } from "../support/path-graphs.js";

describe("history around a path graph", () => {
  it("keeps the old graph when a path graph replaces an ordinary one with the same centre", () => {
    const ordinary = commitCentre(createView(), graphOf("a", ["s"], ["m"]));
    const view = commitCentre(ordinary, pathGraph());
    expect(view.history).toEqual([ordinary.current]);
    expect(view.current?.path).toBeDefined();
  });

  it("keeps the path graph when an ordinary graph replaces it", () => {
    const shown = commitCentre(createView(), pathGraph());
    const view = commitCentre(shown, graphOf("a", ["s"], ["m"]));
    expect(view.history).toHaveLength(1);
    expect(view.history[0]?.path).toBeDefined();
  });

  it("goes Back from a path graph to the previous graph, and Back to a path graph restores its expansions", () => {
    const first = commitCentre(createView(), graphOf("a", ["s"], ["m"]));
    const withPath = commitCentre(first, pathGraph());
    expect(goBack(withPath).current?.path).toBeUndefined();
    expect(goBack(withPath).current?.focusId).toBe(id("a"));

    const grown = mergeExpansion(
      withPath.current ?? pathGraph(),
      id("m"),
      sliceOf("m", ["w"], ["z"]),
    ).graph;
    const elsewhere = commitCentre(
      { ...withPath, current: grown },
      graphOf("b"),
    );
    const back = goBack(elsewhere);
    expect(back.current).toEqual({
      ...grown,
      generation: elsewhere.nextGeneration,
    });
    expect(back.current?.path).toBe(grown.path);
    expect(Object.keys(back.current?.slices ?? {})).toContain(id("m"));
  });

  it("still drops an ordinary graph when it is trivially recoverable", () => {
    const first = commitCentre(createView(), graphOf("a", ["s"]));
    const view = commitCentre(first, graphOf("a", ["s"], ["m"]));
    expect(view.history).toEqual([]);
  });
});
