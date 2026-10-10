import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrailingDebounce } from "../src/debounce.js";

describe("TrailingDebounce", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once with the latest value after the quiet period", () => {
    const seen: number[] = [];
    const debounce = new TrailingDebounce<number>(250, (value) =>
      seen.push(value),
    );
    debounce.push(1);
    vi.advanceTimersByTime(100);
    debounce.push(2);
    vi.advanceTimersByTime(249);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([2]);
  });

  it("runs again for a later push", () => {
    const seen: string[] = [];
    const debounce = new TrailingDebounce<string>(250, (value) =>
      seen.push(value),
    );
    debounce.push("a");
    vi.advanceTimersByTime(250);
    debounce.push("b");
    vi.advanceTimersByTime(250);
    expect(seen).toEqual(["a", "b"]);
  });

  it("does nothing without a push and nothing after dispose", () => {
    const seen: number[] = [];
    const debounce = new TrailingDebounce<number>(250, (value) =>
      seen.push(value),
    );
    vi.advanceTimersByTime(1000);
    debounce.push(1);
    debounce.dispose();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });
});
