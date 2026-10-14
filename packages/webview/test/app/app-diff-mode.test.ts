import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import type { DiffMode } from "../../src/settings/diff-mode.js";
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

const settings = (diffMode: unknown) =>
  ({
    type: "settings",
    columnGap: 192,
    edgeStyle: "stepped",
    diffMode: diffMode as DiffMode,
    testVisibility: "show",
  }) as const;

const pick = (state: AppState, value: DiffMode) =>
  reduceApp(state, { type: "diffModeChanged", value });

describe("diff mode", () => {
  it("starts in uncommitted", () => {
    expect(createAppState(undefined).diffMode).toBe("uncommitted");
  });

  it("applies the first settings message, normalised, and ignores later ones", () => {
    const first = reduceApp(showing(), settings("pr"));
    expect(first.diffMode).toBe("pr");
    expect(reduceApp(first, settings("uncommitted"))).toBe(first);
    const unknown = reduceApp(showing(), settings("merge"));
    expect(unknown.diffMode).toBe("uncommitted");
  });

  it("is set by diffModeChanged", () => {
    expect(pick(showing(), "pr").diffMode).toBe("pr");
  });

  it("returns the same state for the mode already in use", () => {
    const state = showing();
    expect(pick(state, "uncommitted")).toBe(state);
    const pr = pick(state, "pr");
    expect(pick(pr, "pr")).toBe(pr);
  });

  it("is not part of the view", () => {
    const state = showing();
    const next = pick(state, "pr");
    expect(next.view).toBe(state.view);
    expect(isViewState(next.view)).toBe(true);
    expect(createAppState(next.view).diffMode).toBe("uncommitted");
  });
});
