import { describe, expect, it } from "vitest";
import { COLUMN_GAP } from "../../src/settings/column-gap.js";
import {
  mergeExpansion,
  pinNodes,
  graphFromSlice,
} from "../../src/view/graph-state.js";
import {
  canGoBack,
  commitCentre,
  createView,
  goBack,
  HISTORY_LIMIT,
  replaceCurrent,
} from "../../src/view/view-state.js";
import { graphOf, id, PROJECT, sliceOf } from "../support/graph-states.js";

describe("createView", () => {
  it("starts empty with generation 1 next and the default column gap", () => {
    expect(createView()).toEqual({
      version: 1,
      nextGeneration: 1,
      columnGap: COLUMN_GAP.default,
      edgeStyle: "stepped",
      current: undefined,
      history: [],
    });
    expect(createView(96).columnGap).toBe(96);
  });

  it("takes the edge style as its second argument", () => {
    expect(createView(96, "curved").edgeStyle).toBe("curved");
  });
});

describe("the edge style across graph changes", () => {
  it("is kept by commitCentre and goBack", () => {
    const first = commitCentre(createView(192, "curved"), graphOf("a", ["b"]));
    const second = commitCentre(first, graphOf("b", [], ["a"]));
    expect(second.edgeStyle).toBe("curved");
    expect(goBack(second).edgeStyle).toBe("curved");
  });
});

describe("commitCentre", () => {
  it("makes the first graph current with a fresh generation and no history", () => {
    const view = commitCentre(createView(), graphOf("a", ["b"]));
    expect(view.current?.generation).toBe(1);
    expect(view.nextGeneration).toBe(2);
    expect(view.history).toEqual([]);
    expect(canGoBack(view)).toBe(false);
  });

  it("pushes the previous graph when the centre changes", () => {
    const first = commitCentre(createView(), graphOf("a", ["b"]));
    const second = commitCentre(first, graphOf("b", [], ["a"]));
    expect(second.history).toEqual([first.current]);
    expect(second.current?.focusId).toBe(id("b"));
    expect(second.current?.generation).toBe(2);
    expect(canGoBack(second)).toBe(true);
  });

  it("skips a previous graph that re-centring on the same node recreates", () => {
    const first = commitCentre(createView(), graphOf("a", ["b"]));
    const again = commitCentre(first, graphOf("a", ["b"]));
    expect(again.history).toEqual([]);
    expect(again.current?.generation).toBe(2);
  });

  it("keeps a previous graph with expansions, pins or another project", () => {
    const base = graphOf("a", ["b"]);
    const expanded = mergeExpansion(
      base,
      id("b"),
      sliceOf("b", ["d"], ["a"]),
    ).graph;
    const pinned = pinNodes(base, { [id("a")]: { x: 1, y: 1 } });
    const elsewhere = graphFromSlice(
      sliceOf("a", ["b"]),
      "/other/tsconfig.json",
    );

    for (const previous of [expanded, pinned, elsewhere]) {
      const view = commitCentre(commitCentre(createView(), previous), base);
      expect(view.history).toHaveLength(1);
    }
  });

  it("drops the oldest entry when the 21st arrives", () => {
    let view = createView();
    for (let index = 0; index <= HISTORY_LIMIT + 1; index += 1) {
      view = commitCentre(view, graphOf(`n${index}`));
    }
    expect(HISTORY_LIMIT).toBe(20);
    expect(view.history).toHaveLength(20);
    expect(view.history[0]?.focusId).toBe(id("n1"));
    expect(view.history.at(-1)?.focusId).toBe(id("n20"));
    expect(view.current?.focusId).toBe(id("n21"));
  });
});

describe("commitCentre and goBack leave the view they were given alone", () => {
  function twoCentres() {
    const first = commitCentre(createView(), graphOf("a", ["b"]));
    return commitCentre(first, graphOf("b", [], ["a"]));
  }

  it("commitCentre", () => {
    const view = twoCentres();
    const snapshot = structuredClone(view);
    commitCentre(view, graphOf("c"));
    expect(view).toEqual(snapshot);
  });

  it("goBack", () => {
    const view = twoCentres();
    const snapshot = structuredClone(view);
    goBack(view);
    expect(view).toEqual(snapshot);
  });
});

describe("goBack", () => {
  it("restores the previous graph exactly, with a fresh generation", () => {
    const base = graphOf("a", ["b"]);
    let first = commitCentre(createView(), base);
    first = replaceCurrent(
      first,
      pinNodes(
        mergeExpansion(
          first.current ?? base,
          id("b"),
          sliceOf("b", ["d"], ["a"]),
        ).graph,
        { [id("d")]: { x: 30, y: 40 } },
      ),
    );
    const left = first.current;
    const second = commitCentre(first, graphOf("b", [], ["a"]));

    const back = goBack(second);

    expect(back.current).toEqual({
      ...left,
      generation: second.nextGeneration,
    });
    expect(back.current?.generation).toBeGreaterThan(
      second.current?.generation ?? 0,
    );
    expect(back.nextGeneration).toBe(second.nextGeneration + 1);
    expect(back.history).toEqual([]);
    expect(canGoBack(back)).toBe(false);
  });

  it("steps back through several centres, newest first", () => {
    let view = createView();
    for (const name of ["a", "b", "c"]) {
      view = commitCentre(view, graphOf(name));
    }
    view = goBack(view);
    expect(view.current?.focusId).toBe(id("b"));
    view = goBack(view);
    expect(view.current?.focusId).toBe(id("a"));
  });

  it("changes nothing when there is no history", () => {
    const view = commitCentre(createView(), graphOf("a"));
    expect(goBack(view)).toBe(view);
  });
});

describe("replaceCurrent", () => {
  it("swaps the current graph without touching history or generations", () => {
    const view = commitCentre(createView(), graphOf("a", ["b"]));
    const next = replaceCurrent(
      view,
      graphFromSlice(sliceOf("a"), PROJECT, { [id("a")]: { x: 1, y: 2 } }),
    );
    expect(next.current?.positions).toEqual({ [id("a")]: { x: 1, y: 2 } });
    expect(next.nextGeneration).toBe(view.nextGeneration);
    expect(next.history).toBe(view.history);
  });
});
