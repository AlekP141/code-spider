import { describe, expect, it } from "vitest";
import {
  countRoutes,
  FINAL_COUNT_LIMITS,
  PROGRESS_COUNT_LIMITS,
} from "../../src/path/route-count.js";
import { routeStepsOf } from "./graph-source.js";

/** Layers of two functions, each fully linked to the next. */
function layers(depth: number, end?: string): string[] {
  const specs = ["A > L1a", "A > L1b"];
  for (let layer = 1; layer < depth; layer += 1) {
    for (const from of ["a", "b"]) {
      for (const to of ["a", "b"]) {
        specs.push(`L${layer}${from} > L${layer + 1}${to}`);
      }
    }
  }
  if (end) specs.push(`L${depth}a > ${end}`, `L${depth}b > ${end}`);
  return specs;
}

const count = (specs: string[], limits = FINAL_COUNT_LIMITS) =>
  countRoutes(routeStepsOf(...specs), "A", "B", limits);

describe("countRoutes", () => {
  it("equals the paths through the turning points on a split-and-rejoin shape", () => {
    const specs = [
      "A > P1",
      "A > P2",
      "P1 > T",
      "P2 > T",
      "T > C1",
      "T > C2",
      "C1 > B",
      "C2 > B",
    ];
    expect(count(specs)).toEqual({ routes: 4, capped: false });
  });

  it("stops at 1,000 paths and reports capped", () => {
    expect(count(layers(10, "B"))).toEqual({ routes: 1000, capped: true });
    expect(count(layers(9, "B"))).toEqual({ routes: 512, capped: false });
  });

  it("stops at 200,000 link visits and reports capped", () => {
    expect(count(layers(17))).toEqual({ routes: 0, capped: true });
    expect(count(layers(15))).toEqual({ routes: 0, capped: false });
  });

  it("stops the progress count at 20,000 link visits and reports capped", () => {
    expect(count(layers(14), PROGRESS_COUNT_LIMITS)).toEqual({
      routes: 0,
      capped: true,
    });
    expect(count(layers(13), PROGRESS_COUNT_LIMITS)).toEqual({
      routes: 0,
      capped: false,
    });
  });
});
