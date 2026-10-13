import { describe, expect, it } from "vitest";
import { isGraphState, isViewState } from "../../src/view/persist.js";
import { mergeExpansion } from "../../src/view/graph-state.js";
import { commitCentre, createView } from "../../src/view/view-state.js";
import { graphOf, id, sliceOf } from "../support/graph-states.js";

function graph() {
  return mergeExpansion(
    graphOf("a", ["b"], ["c"]),
    id("b"),
    sliceOf("b", ["d"], ["a"]),
  ).graph;
}

function viaJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe("isGraphState and open", () => {
  it("accepts a graph without open, as an older save has", () => {
    const { open: _omitted, ...older } = graph();
    expect(isGraphState(older)).toBe(true);
    expect(isGraphState(viaJson(older))).toBe(true);
  });

  it("accepts an empty list and a list of ids in the graph, also after JSON", () => {
    const empty = { ...graph(), open: [] };
    const listed = { ...graph(), open: [id("a"), id("d")] };
    expect(isGraphState(empty)).toBe(true);
    expect(isGraphState(viaJson(empty))).toBe(true);
    expect(isGraphState(listed)).toBe(true);
    expect(isGraphState(viaJson(listed))).toBe(true);
  });

  it("rejects open that is not an array", () => {
    expect(isGraphState({ ...graph(), open: id("a") })).toBe(false);
    expect(isGraphState({ ...graph(), open: { [id("a")]: true } })).toBe(false);
    expect(isGraphState({ ...graph(), open: null })).toBe(false);
  });

  it("rejects open holding a non-string", () => {
    expect(isGraphState({ ...graph(), open: [id("a"), 3] })).toBe(false);
    expect(isGraphState({ ...graph(), open: [null] })).toBe(false);
  });

  it("rejects open holding an id that is not a node", () => {
    expect(isGraphState({ ...graph(), open: [id("zzz")] })).toBe(false);
    expect(isGraphState({ ...graph(), open: [id("a"), id("zzz")] })).toBe(
      false,
    );
  });
});

describe("isViewState and open", () => {
  it("is false when a history entry has a bad open", () => {
    const first = commitCentre(createView(), graphOf("a", ["b"]));
    const view = commitCentre(first, graphOf("b", ["c"]));
    expect(view.history).toHaveLength(1);
    expect(isViewState(view)).toBe(true);
    const [entry] = view.history;
    if (!entry) throw new Error("no history");
    const broken = { ...view, history: [{ ...entry, open: [id("zzz")] }] };
    expect(isViewState(broken)).toBe(false);
  });
});
