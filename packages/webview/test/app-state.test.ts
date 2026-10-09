import { describe, expect, it } from "vitest";
import { initialState, reduceMessage } from "../src/app-state.js";

const slice = { focusId: "a#b", nodes: [], edges: [], truncated: false };

describe("reduceMessage", () => {
  it("starts empty", () => {
    expect(initialState).toEqual({
      slice: undefined,
      error: undefined,
      busy: false,
      indexing: false,
    });
  });

  it("stores a slice and clears an earlier error", () => {
    const failed = reduceMessage(initialState, {
      type: "analysisError",
      message: "boom",
    });
    const next = reduceMessage(failed, { type: "slice", slice });
    expect(next.slice).toBe(slice);
    expect(next.error).toBeUndefined();
  });

  it("keeps the previous slice when an error arrives", () => {
    const withSlice = reduceMessage(initialState, { type: "slice", slice });
    const next = reduceMessage(withSlice, {
      type: "analysisError",
      message: "boom",
    });
    expect(next.slice).toBe(slice);
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
});
