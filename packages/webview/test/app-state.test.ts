import { describe, expect, it } from "vitest";
import { initialState, reduceMessage } from "../src/app-state.js";

const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };
const project = "/repo/tsconfig.json";
const centre = {
  type: "slice",
  slice,
  project,
  mode: { kind: "centre" },
} as const;

describe("reduceMessage", () => {
  it("starts empty", () => {
    expect(initialState).toEqual({
      centre: undefined,
      error: undefined,
      busy: false,
      indexing: false,
    });
  });

  it("stores a centre slice with its project and clears an earlier error", () => {
    const failed = reduceMessage(initialState, {
      type: "analysisError",
      message: "boom",
    });
    const next = reduceMessage(failed, centre);
    expect(next.centre).toEqual({ slice, project });
    expect(next.error).toBeUndefined();
  });

  it("ignores an expansion slice, which only a later task merges", () => {
    const withCentre = reduceMessage(initialState, centre);
    const next = reduceMessage(withCentre, {
      type: "slice",
      slice: { ...slice, focusId: "a#other" },
      project,
      mode: { kind: "expansion", nodeId: "a#other", generation: 1 },
    });
    expect(next).toBe(withCentre);
  });

  it("keeps the previous graph when an error arrives", () => {
    const withCentre = reduceMessage(initialState, centre);
    const next = reduceMessage(withCentre, {
      type: "analysisError",
      message: "boom",
    });
    expect(next.centre).toEqual({ slice, project });
    expect(next.error).toBe("boom");
  });

  it("clears a stale error when new work starts, not when it ends", () => {
    const failed = reduceMessage(initialState, {
      type: "analysisError",
      message: "boom",
    });
    const started = reduceMessage(failed, { type: "busy", busy: true });
    expect(started.busy).toBe(true);
    expect(started.error).toBeUndefined();

    const failedAgain = reduceMessage(started, {
      type: "analysisError",
      message: "again",
    });
    const ended = reduceMessage(failedAgain, { type: "busy", busy: false });
    expect(ended.busy).toBe(false);
    expect(ended.error).toBe("again");
  });

  it("tracks indexing separately from busy", () => {
    const next = reduceMessage(initialState, {
      type: "indexing",
      indexing: true,
    });
    expect(next.indexing).toBe(true);
    expect(next.busy).toBe(false);
  });

  it("leaves the state alone for expandFailed and settings", () => {
    expect(
      reduceMessage(initialState, {
        type: "expandFailed",
        nodeId: "a#b",
        generation: 1,
        message: "gone",
      }),
    ).toBe(initialState);
    expect(
      reduceMessage(initialState, { type: "settings", columnGap: 192 }),
    ).toBe(initialState);
  });
});
