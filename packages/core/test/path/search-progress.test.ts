import { describe, expect, it } from "vitest";
import type { PathProgress } from "../../src/types.js";
import { createStopSignal } from "../../src/path/signal.js";
import { fakeClock, newFlag, parseCalls, search } from "./graph-source.js";

const UP_THEN_DOWN = parseCalls("P > A", "T > P", "C > B", "T > C");
const SPLIT = parseCalls(
  "P1 > A",
  "P2 > A",
  "T > P1",
  "T > P2",
  "C > B",
  "T > C",
);

function collect(calls: ReturnType<typeof parseCalls>, step = 0) {
  const clock = fakeClock();
  const reports: { at: number; progress: PathProgress }[] = [];
  const output = search(
    calls,
    {
      signal: createStopSignal(newFlag(), 3_600_000, clock.now),
      now: clock.now,
      onProgress: (progress) => reports.push({ at: clock.now(), progress }),
    },
    { onClimb: () => clock.advance(step) },
  );
  return { reports, ...output };
}

describe("search progress", () => {
  it("reports (0, 0) first, then one report per round end", () => {
    const { reports } = collect(UP_THEN_DOWN);
    expect(reports.map((r) => r.progress)).toEqual([
      { checked: 0, routes: 0, routesCapped: false },
      { checked: 2, routes: 0, routesCapped: false },
      { checked: 4, routes: 1, routesCapped: false },
    ]);
  });

  it("reports inside a round at most every 250 ms and changes only checked", () => {
    const calls = parseCalls(
      "P1 > A",
      "P2 > A",
      "P3 > A",
      "P4 > A",
      "P5 > A",
      "P6 > A",
    );
    const { reports } = collect(calls, 100);
    expect(reports.map((r) => [r.at, r.progress.checked])).toEqual([
      [0, 0],
      [200, 2],
      [500, 5],
      [800, 8],
      [800, 8],
    ]);
    for (const { progress } of reports) {
      expect(progress.routes).toBe(0);
      expect(progress.routesCapped).toBe(false);
    }
  });

  it("carries the interim route count in a round-end report", () => {
    const { reports } = collect(SPLIT);
    const last = reports[reports.length - 1]?.progress;
    expect(last).toEqual({ checked: 5, routes: 2, routesCapped: false });
  });

  it("sets summary.checked on a found result to the climbs finished", () => {
    const { result } = collect(parseCalls("A > X", "X > B"));
    if (result.status !== "found") throw new Error(result.status);
    expect(result.summary).toEqual({
      routes: 1,
      routesCapped: false,
      leftOut: 0,
      checked: 3,
    });
  });

  it("reports cancelled with no routes for a cancelled search", () => {
    const flag = newFlag();
    Atomics.store(flag, 0, 1);
    const reports: PathProgress[] = [];
    const { result } = search(UP_THEN_DOWN, {
      signal: createStopSignal(flag, 3_600_000),
      onProgress: (progress) => reports.push(progress),
    });
    expect(result).toEqual({ status: "cancelled" });
    expect(reports).toEqual([{ checked: 0, routes: 0, routesCapped: false }]);
  });
});
