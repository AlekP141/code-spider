import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrailingDebounce } from "../../src/changes/debounce.js";

describe("TrailingDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs a burst once with the last value after the delay", () => {
    const seen: number[] = [];
    const debounce = new TrailingDebounce<number>(200, (value) =>
      seen.push(value),
    );
    debounce.push(1);
    vi.advanceTimersByTime(100);
    debounce.push(2);
    vi.advanceTimersByTime(199);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([2]);
  });

  it("cancels a pending run on dispose", () => {
    const seen: number[] = [];
    const debounce = new TrailingDebounce<number>(200, (value) =>
      seen.push(value),
    );
    debounce.push(1);
    debounce.dispose();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });

  it("runs again for a later push", () => {
    const seen: string[] = [];
    const debounce = new TrailingDebounce<string>(200, (value) =>
      seen.push(value),
    );
    debounce.push("a");
    vi.advanceTimersByTime(200);
    debounce.push("b");
    vi.advanceTimersByTime(200);
    expect(seen).toEqual(["a", "b"]);
  });
});
