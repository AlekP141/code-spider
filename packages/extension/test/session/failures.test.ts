import { describe, expect, it, vi } from "vitest";
import { FailureReporter } from "../../src/session/failures.js";
import { WorkerCrashedError } from "../../src/worker/worker-client.js";

const heapText =
  'Code Spider ran out of memory analysing this project (limit 4096 MB). Raise "codeSpider.worker.maxHeapMb" in settings and try again.';
const timeAdvice = ' Lower "codeSpider.path.timeLimitSeconds" to stop sooner.';

function setup() {
  const notifier = { warn: vi.fn(), error: vi.fn(), status: vi.fn() };
  return { notifier, reporter: new FailureReporter(notifier, () => 4096) };
}

describe("FailureReporter", () => {
  it("describes a crash and the out-of-memory text with the heap advice", () => {
    const { reporter } = setup();
    expect(reporter.describe(new Error("broken tsconfig"))).toBe(
      "broken tsconfig",
    );
    expect(reporter.describe("plain")).toBe("plain");
    const stopped = new WorkerCrashedError("The worker stopped", false);
    expect(reporter.describe(stopped)).toBe(
      "The worker stopped. The next request starts a fresh worker.",
    );
    expect(reporter.describe(new WorkerCrashedError("oom", true))).toBe(
      heapText,
    );
  });

  it("adds the time-limit advice to the out-of-memory text of a search", () => {
    const { reporter } = setup();
    const oom = new WorkerCrashedError("oom", true);
    expect(reporter.describe(oom, true)).toBe(heapText + timeAdvice);
    expect(reporter.describe(new Error("x"), true)).toBe("x");
  });

  it("notifies a crash once per error", () => {
    const { reporter, notifier } = setup();
    const crash = new WorkerCrashedError("The worker stopped", false);
    reporter.notifyCrash(crash, "first");
    reporter.notifyCrash(crash, "again");
    reporter.notifyCrash(new Error("not a crash"), "ignored");
    expect(notifier.error.mock.calls).toEqual([["first"]]);
    reporter.notifyCrash(new WorkerCrashedError("another", false), "second");
    expect(notifier.error).toHaveBeenCalledTimes(2);
  });
});
