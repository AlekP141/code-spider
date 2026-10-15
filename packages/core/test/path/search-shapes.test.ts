import { describe, expect, it } from "vitest";
import type { SearchResult } from "../../src/path/search.js";
import {
  fakeClock,
  newFlag,
  parseCalls,
  search,
  turningOf,
} from "./graph-source.js";
import { createStopSignal } from "../../src/path/signal.js";

function found(result: SearchResult) {
  if (result.status !== "found") throw new Error(`got ${result.status}`);
  return result;
}

/** Box ids left to right, nearest first inside a column. */
function idsByColumn(result: SearchResult): string[] {
  return [...found(result).arranged.boxes]
    .sort((x, y) => x.column - y.column)
    .map((box) => box.id);
}

const sortedSet = (ids: Iterable<string>) => [...ids].sort();

describe("search shapes", () => {
  it("straight down A > X > B gives A, X, B", () => {
    const calls = parseCalls("A > X", "X > B");
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "X", "B"]);
    expect(found(result).summary.routes).toBe(1);
    expect(sortedSet(turningOf(calls))).toEqual(["A"]);
  });

  it("straight up B > X > A gives A, X, B", () => {
    const calls = parseCalls("B > X", "X > A");
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "X", "B"]);
    expect(found(result).summary.routes).toBe(1);
    expect(sortedSet(turningOf(calls))).toEqual(["B"]);
  });

  it("up then down gives A, P, T, C, B and never climbs the function above T", () => {
    const calls = parseCalls("P > A", "T > P", "C > B", "T > C", "App > T");
    const { result, asked } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "P", "T", "C", "B"]);
    expect(found(result).summary.routes).toBe(1);
    expect(asked).not.toContain("T");
    expect(asked).not.toContain("App");
  });

  it("several turning points give A, T1, T2, B and two routes", () => {
    const calls = parseCalls("T1 > A", "T2 > A", "T1 > B", "T2 > B");
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "T1", "T2", "B"]);
    expect(found(result).summary.routes).toBe(2);
    expect(sortedSet(turningOf(calls))).toEqual(["T1", "T2"]);
  });

  it("nearer blocks farther: T1 calls A and B, T2 calls T1 and B gives A, T1, B only", () => {
    const calls = parseCalls("T1 > A", "T2 > T1", "T1 > B", "T2 > B");
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "T1", "B"]);
    expect(found(result).summary.routes).toBe(1);
  });

  it("reached only past a turning point gives A, U, W, B and drops V", () => {
    const calls = parseCalls("U > A", "V > U", "V > B", "W > B", "U > W");
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "U", "W", "B"]);
    expect(found(result).summary.routes).toBe(1);
    expect(turningOf(calls).has("U")).toBe(true);
  });

  it("split and rejoin with one function on the B side gives A, P1, P2, T, C, B and two routes", () => {
    const calls = parseCalls(
      "P1 > A",
      "P2 > A",
      "T > P1",
      "T > P2",
      "C > B",
      "T > C",
    );
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "P1", "P2", "T", "C", "B"]);
    expect(found(result).summary.routes).toBe(2);
  });

  it("split and rejoin with two functions on each side gives seven boxes and four routes", () => {
    const calls = parseCalls(
      "P1 > A",
      "P2 > A",
      "T > P1",
      "T > P2",
      "C1 > B",
      "C2 > B",
      "T > C1",
      "T > C2",
    );
    const { result } = search(calls);
    expect(found(result).arranged.boxes).toHaveLength(7);
    expect(found(result).summary.routes).toBe(4);
  });

  it("direct case with a bypass (F calls A and B, A calls B) gives A and B only", () => {
    const calls = parseCalls("F > A", "F > B", "A > B");
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "B"]);
    expect(found(result).summary.routes).toBe(1);
  });

  it("mutual recursion gives A and B, both turning points, two links", () => {
    const calls = parseCalls("A > B", "B > A");
    const { result } = search(calls);
    expect(idsByColumn(result)).toEqual(["A", "B"]);
    expect(found(result).arranged.steps).toHaveLength(2);
    expect(found(result).summary.routes).toBe(1);
    expect(sortedSet(turningOf(calls))).toEqual(["A", "B"]);
  });

  it("ends that no function links give none, with the climbs counted", () => {
    const calls = parseCalls("P > A", "Q > B");
    const { result, asked } = search(calls);
    expect(result).toEqual({ status: "none", checked: 4 });
    expect(asked).toEqual(["A", "B", "P", "Q"]);

    const clock = fakeClock();
    const flag = newFlag();
    const limited = search(
      calls,
      { signal: createStopSignal(flag, 5, clock.now), now: clock.now },
      { onClimb: () => clock.advance(10) },
    );
    expect(limited.result).toEqual({
      status: "none",
      checked: 1,
      stoppedBy: "time",
    });
  });

  it("returns the routes found so far with stoppedBy time when the time limit ends the search", () => {
    const clock = fakeClock();
    const { result } = search(
      parseCalls("A > B", "Z1 > B", "Z2 > Z1"),
      { signal: createStopSignal(newFlag(), 25, clock.now), now: clock.now },
      { onClimb: () => clock.advance(10) },
    );
    expect(idsByColumn(result)).toEqual(["A", "B"]);
    expect(found(result).summary).toEqual({
      routes: 1,
      routesCapped: false,
      leftOut: 0,
      checked: 3,
      stoppedBy: "time",
    });
  });

  it("refuses equal ends with 'The start and the end are the same function'", () => {
    expect(() => search(parseCalls("A > B"), { a: "A", b: "A" })).toThrow(
      "The start and the end are the same function",
    );
  });
});
