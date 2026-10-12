import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedFlag } from "../../src/app/delayed-flag.js";

describe("DelayedFlag", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup() {
    const changes: boolean[] = [];
    const flag = new DelayedFlag(500, (shown) => changes.push(shown));
    return { changes, flag };
  }

  it("stays hidden for work shorter than the delay", () => {
    const { changes, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(499);
    flag.set(false);
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });

  it("shows after the delay and hides immediately", () => {
    const { changes, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(500);
    expect(changes).toEqual([true]);
    flag.set(false);
    expect(changes).toEqual([true, false]);
  });

  it("does not restart the delay when set(true) repeats", () => {
    const { changes, flag } = setup();
    flag.set(true);
    vi.advanceTimersByTime(300);
    flag.set(true);
    vi.advanceTimersByTime(200);
    expect(changes).toEqual([true]);
  });

  it("does not report a change for set(false) while hidden", () => {
    const { changes, flag } = setup();
    flag.set(false);
    expect(changes).toEqual([]);
  });

  it("dispose cancels a pending show", () => {
    const { changes, flag } = setup();
    flag.set(true);
    flag.dispose();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([]);
  });
});
