import { describe, expect, it } from "vitest";
import { arrangeRoutes } from "../../src/path/route-graph.js";
import { functionsOf, routeStepsOf } from "./graph-source.js";

function arrange(specs: string[], maxBoxes = 100) {
  const steps = routeStepsOf(...specs);
  return arrangeRoutes(
    { functions: functionsOf(steps), steps },
    "A",
    "B",
    maxBoxes,
  );
}

const SHORT_AND_LONG = ["A > X", "X > B", "A > P", "P > Q", "Q > B"];
const ids = (arranged: ReturnType<typeof arrange>) =>
  arranged.boxes.map((box) => box.id);

describe("arrangeRoutes", () => {
  it("ranks functions by length, nearest first, ties by id", () => {
    expect(ids(arrange(SHORT_AND_LONG))).toEqual(["A", "B", "X", "P", "Q"]);
  });

  it("keeps whole length groups while the total stays within the cap", () => {
    expect(ids(arrange(SHORT_AND_LONG, 4))).toEqual(["A", "B", "X"]);
    expect(ids(arrange(SHORT_AND_LONG, 5))).toHaveLength(5);
  });

  it("keeps the first group whole even when it alone exceeds the cap", () => {
    const arranged = arrange(SHORT_AND_LONG, 1);
    expect(ids(arranged)).toEqual(["A", "B", "X"]);
    expect(arranged.leftOut).toBe(2);
  });

  it("counts the cut functions in leftOut and drops a step with a cut end", () => {
    const arranged = arrange(SHORT_AND_LONG, 3);
    expect(arranged.leftOut).toBe(2);
    expect(arranged.steps.map((s) => `${s.from}>${s.to}`)).toEqual([
      "A>X",
      "X>B",
    ]);
    expect(arranged.routes).toBe(1);
  });

  it("puts each function in the column of its longest path from A, with B alone in the last column", () => {
    const arranged = arrange([...SHORT_AND_LONG, "A > B"]);
    const column = new Map(arranged.boxes.map((box) => [box.id, box.column]));
    expect(Object.fromEntries(column)).toEqual({
      A: 0,
      X: 1,
      P: 1,
      Q: 2,
      B: 3,
    });
  });

  it("ignores a link that closes a cycle for columns", () => {
    const arranged = arrange(["A > X", "X > Y", "Y > X", "Y > B"]);
    const column = new Map(arranged.boxes.map((box) => [box.id, box.column]));
    expect(Object.fromEntries(column)).toEqual({ A: 0, X: 1, Y: 2, B: 3 });
  });

  it("lists the boxes of one column in rank order", () => {
    const arranged = arrange(SHORT_AND_LONG);
    const first = arranged.boxes.filter((box) => box.column === 1);
    expect(first.map((box) => box.id)).toEqual(["X", "P"]);
  });
});
