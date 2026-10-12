import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSpacingControl } from "../../src/toolbar/spacing-control.js";

function setup() {
  const dispatch = vi.fn();
  const tidy = vi.fn();
  const post = vi.fn();
  const control = createSpacingControl({ dispatch, tidy, post });
  return { dispatch, tidy, post, control };
}

describe("createSpacingControl", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("dispatches columnGapChanged at once and nothing else", () => {
    const { dispatch, tidy, post, control } = setup();
    control.change(128);
    expect(dispatch).toHaveBeenCalledWith({
      type: "columnGapChanged",
      value: 128,
    });
    expect(tidy).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("runs Tidy once and posts the last value after a burst", () => {
    const { dispatch, tidy, post, control } = setup();
    control.change(128);
    vi.advanceTimersByTime(100);
    control.change(160);
    vi.advanceTimersByTime(100);
    control.change(224);
    vi.advanceTimersByTime(249);
    expect(tidy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(tidy).toHaveBeenCalledTimes(1);
    expect(post.mock.calls).toEqual([[{ type: "setColumnGap", value: 224 }]]);
  });

  it("cancels a pending run on dispose", () => {
    const { tidy, post, control } = setup();
    control.change(128);
    control.dispose();
    vi.advanceTimersByTime(1000);
    expect(tidy).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
