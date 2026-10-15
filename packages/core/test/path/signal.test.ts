import { describe, expect, it } from "vitest";
import { ts } from "ts-morph";
import { cancellationToken, createStopSignal } from "../../src/path/signal.js";
import { fakeClock, newFlag } from "./graph-source.js";

describe("stop signal", () => {
  it("is not requested before the flag is set or the deadline passes", () => {
    const clock = fakeClock();
    const signal = createStopSignal(newFlag(), 100, clock.now);
    clock.advance(99);
    expect(signal.isRequested()).toBe(false);
    expect(signal.reason()).toBeUndefined();
  });

  it("is requested with reason cancelled once the flag is set through another view of the buffer", () => {
    const buffer = new SharedArrayBuffer(4);
    const signal = createStopSignal(new Int32Array(buffer), 100, () => 0);
    Atomics.store(new Int32Array(buffer), 0, 1);
    expect(signal.isRequested()).toBe(true);
    expect(signal.reason()).toBe("cancelled");
  });

  it("is requested with reason time once the fake clock passes the deadline", () => {
    const clock = fakeClock(1_000);
    const signal = createStopSignal(newFlag(), 100, clock.now);
    clock.advance(101);
    expect(signal.isRequested()).toBe(true);
    expect(signal.reason()).toBe("time");
  });

  it("reports cancelled when both the flag and the deadline hold", () => {
    const clock = fakeClock();
    const flag = newFlag();
    const signal = createStopSignal(flag, 100, clock.now);
    clock.advance(500);
    Atomics.store(flag, 0, 1);
    expect(signal.reason()).toBe("cancelled");
  });

  it("gives a token that mirrors the signal and throws OperationCanceledException only when requested", () => {
    const flag = newFlag();
    const token = cancellationToken(createStopSignal(flag, 100, () => 0));
    expect(token.isCancellationRequested()).toBe(false);
    expect(() => token.throwIfCancellationRequested()).not.toThrow();
    Atomics.store(flag, 0, 1);
    expect(token.isCancellationRequested()).toBe(true);
    expect(() => token.throwIfCancellationRequested()).toThrow(
      ts.OperationCanceledException,
    );
  });
});
