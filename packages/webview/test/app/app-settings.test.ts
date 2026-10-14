import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import type { EdgeStyle } from "../../src/settings/edge-style.js";
import { isViewState } from "../../src/view/persist.js";
import { id, PROJECT, sliceOf } from "../support/graph-states.js";

function showing(): AppState {
  const pending = reduceApp(createAppState(undefined), {
    type: "slice",
    slice: sliceOf("a", ["s"]),
    project: PROJECT,
    mode: { kind: "centre", sourceVersion: 0 },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions: { [id("a")]: { x: 10, y: 20 }, [id("s")]: { x: 0, y: 0 } },
  });
}

const settings = (columnGap: number, edgeStyle: unknown) =>
  ({
    type: "settings",
    columnGap,
    edgeStyle: edgeStyle as EdgeStyle,
    diffMode: "uncommitted",
    testVisibility: "show",
  }) as const;

const pick = (state: AppState, value: EdgeStyle) =>
  reduceApp(state, { type: "edgeStyleChanged", value });

describe("the first settings message", () => {
  it("applies both values, normalised, without a fit", () => {
    const state = showing();
    const next = reduceApp(state, settings(100, "curved"));
    expect(next.view.columnGap).toBe(96);
    expect(next.view.edgeStyle).toBe("curved");
    expect(next.settingsApplied).toBe(true);
    expect(next.fit).toBe(state.fit);
    expect(next.view.current).toBe(state.view.current);
    expect(isViewState(next.view)).toBe(true);
  });

  it("falls back to the default style for a name it does not know", () => {
    const curved = pick(showing(), "curved");
    const next = reduceApp(curved, settings(192, "wavy"));
    expect(next.view.edgeStyle).toBe("stepped");
  });

  it("ignores later ones", () => {
    const first = reduceApp(showing(), settings(128, "curved"));
    const again = reduceApp(first, settings(256, "stepped"));
    expect(again).toBe(first);
    expect(again.view.edgeStyle).toBe("curved");
    expect(again.view.columnGap).toBe(128);
  });
});

describe("edgeStyleChanged", () => {
  it("stores the style and keeps the view restorable", () => {
    const next = pick(showing(), "curved");
    expect(next.view.edgeStyle).toBe("curved");
    expect(isViewState(next.view)).toBe(true);
  });

  it("is a no-op for the style already in use", () => {
    const state = showing();
    expect(pick(state, "stepped")).toBe(state);
    const curved = pick(state, "curved");
    expect(pick(curved, "curved")).toBe(curved);
  });

  it("treats a view saved without a style as stepped", () => {
    const { edgeStyle: _omitted, ...older } = showing().view;
    const state = createAppState(older);
    expect(state.view.edgeStyle).toBeUndefined();
    expect(pick(state, "stepped")).toBe(state);
  });

  it("leaves positions, pins, history and the fit alone", () => {
    const state = showing();
    const next = pick(state, "curved");
    expect(next.view.current).toBe(state.view.current);
    expect(next.view.history).toBe(state.view.history);
    expect(next.fit).toBe(state.fit);
    expect(next.pending).toBeUndefined();
  });
});
