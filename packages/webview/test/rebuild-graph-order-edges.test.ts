import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../src/graph/constants.js";
import type { Point } from "../src/view/types.js";
import { calledSlice, id } from "./support/graph-states.js";
import {
  A,
  at,
  COLUMN,
  graphAt,
  HEIGHT,
  inColumn,
  MARGIN,
  PITCH,
  refresh,
  ROW,
} from "./support/refresh-order.js";

describe("rebuildGraph restacks around pinned, off column and shared boxes", () => {
  it("keeps a pinned called box where it is and restacks the others around it", () => {
    const current = graphAt(
      calledSlice("a", ["x", "y", "z"]),
      { a: A, x: inColumn(0), y: inColumn(100), z: inColumn(900) },
      ["y"],
    );
    const { graph } = refresh(current, calledSlice("a", ["z", "x", "y"]));
    expect(at(graph, "y")).toEqual(inColumn(100));
    expect(at(graph, "z")?.y).toBeGreaterThan(100 + HEIGHT);
    expect(at(graph, "x")?.y).toBe((at(graph, "z")?.y ?? 0) + ROW);
  });

  it("leaves a called box outside the called column alone", () => {
    const aside: Point = { x: COLUMN + 90, y: 400 };
    const current = graphAt(calledSlice("a", ["x", "y"]), {
      a: A,
      x: inColumn(0),
      y: aside,
    });
    const swapped = refresh(current, calledSlice("a", ["y", "x"]));
    expect(swapped.graph.positions).toEqual(current.positions);
    const inserted = refresh(current, calledSlice("a", ["y", "n", "x"]));
    expect(at(inserted.graph, "y")).toEqual(aside);
    expect(at(inserted.graph, "n")).toEqual(inColumn(0));
    expect(at(inserted.graph, "x")).toEqual(inColumn(ROW));
  });

  it("restacks an expanded function's called boxes while the centre's group stays", () => {
    const centre = calledSlice("a", ["m"]);
    const inner = calledSlice("m", ["p", "q"]);
    const innerColumn = COLUMN - PITCH;
    const current = graphAt(
      centre,
      {
        a: A,
        m: inColumn(0),
        p: { x: innerColumn, y: 0 },
        q: { x: innerColumn, y: 400 },
      },
      [],
      [inner],
    );
    const { graph } = refresh(current, centre, [calledSlice("m", ["q", "p"])]);
    expect(at(graph, "q")).toEqual({ x: innerColumn, y: 0 });
    expect(at(graph, "p")).toEqual({ x: innerColumn, y: ROW });
    expect(at(graph, "m")).toEqual(inColumn(0));
    expect(at(graph, "a")).toEqual(A);
  });

  describe("a box two functions call", () => {
    const below = (key: string, called: string[]) => calledSlice(key, called);
    const spots = (x: number, y: number, w: number) => ({
      a: A,
      b: { x: A.x, y: 600 },
      y: inColumn(y),
      x: inColumn(x),
      w: inColumn(w),
    });
    const graph = (x: number, y: number, w: number) =>
      graphAt(
        calledSlice("a", ["y", "x"], ["b"]),
        spots(x, y, w),
        [],
        [below("b", ["x", "w"])],
      );

    it("joins only the earlier function's group once that group was restacked", () => {
      const current = graph(400, 0, 800);
      const centre = calledSlice("a", ["x", "y"], ["b"]);
      const { graph: rebuilt } = refresh(current, centre, [
        calledSlice("b", ["w", "x"]),
      ]);
      expect(at(rebuilt, "x")).toEqual(inColumn(0));
      expect(at(rebuilt, "y")).toEqual(inColumn(ROW));
      expect(at(rebuilt, "w")).toEqual(inColumn(800));
    });

    it("joins only the earlier function's group when that group was left untouched", () => {
      const current = graph(400, 0, 800);
      const centre = calledSlice("a", ["y", "x"], ["b"]);
      const { graph: rebuilt } = refresh(current, centre, [
        calledSlice("b", ["w", "x"]),
      ]);
      expect(rebuilt.positions).toEqual(current.positions);
    });
  });

  it("places the new called boxes of a function with no group member in code order", () => {
    const current = graphAt(calledSlice("a", []), { a: A });
    const { graph, added } = refresh(current, calledSlice("a", ["n2", "n1"]));
    expect(at(graph, "n2")?.x).toBe(COLUMN);
    expect(at(graph, "n1")?.x).toBe(COLUMN);
    expect(at(graph, "n2")?.y).toBeLessThan(at(graph, "n1")?.y ?? NaN);
    expect([...added].sort()).toEqual([id("n1"), id("n2")]);
  });

  it("places new called boxes by code order when the old ones are all pinned or off column", () => {
    const aside: Point = { x: COLUMN + 90, y: 400 };
    const current = graphAt(
      calledSlice("a", ["x", "y"]),
      { a: A, x: inColumn(0), y: aside },
      ["x"],
    );
    const { graph, added } = refresh(
      current,
      calledSlice("a", ["y", "n2", "x", "n1"]),
    );
    expect(at(graph, "x")).toEqual(inColumn(0));
    expect(at(graph, "y")).toEqual(aside);
    expect(at(graph, "n2")?.x).toBe(COLUMN);
    expect(at(graph, "n2")?.y).toBeLessThan(at(graph, "n1")?.y ?? NaN);
    expect([...added].sort()).toEqual([id("n1"), id("n2")]);
  });

  it("places new callers in the right column in id order", () => {
    const current = graphAt(calledSlice("a", ["x"]), { a: A, x: inColumn(0) });
    const { graph, added } = refresh(
      current,
      calledSlice("a", ["x"], ["c", "b"]),
    );
    expect(at(graph, "x")).toEqual(inColumn(0));
    expect(at(graph, "b")?.x).toBe(A.x + PITCH);
    expect(at(graph, "c")?.x).toBe(A.x + PITCH);
    expect(at(graph, "b")?.y).toBeLessThan(at(graph, "c")?.y ?? NaN);
    expect([...added].sort()).toEqual([id("b"), id("c")]);
  });

  it("pushes the whole group down when a pinned box overlaps its top, keeping order and spacing", () => {
    const current = graphAt(
      calledSlice("a", ["x", "y", "p"]),
      { a: A, p: inColumn(0), x: inColumn(10), y: inColumn(400) },
      ["p"],
    );
    const { graph } = refresh(current, calledSlice("a", ["y", "x", "p"]));
    expect(at(graph, "p")).toEqual(inColumn(0));
    expect(at(graph, "y")).toEqual(inColumn(ROW));
    expect(at(graph, "x")).toEqual(inColumn(2 * ROW));
  });

  it("slides a restacked box off a pinned box it lands on", () => {
    const current = graphAt(
      calledSlice("a", ["x", "y", "p"]),
      { a: A, p: inColumn(150), x: inColumn(0), y: inColumn(400) },
      ["p"],
    );
    const { graph } = refresh(current, calledSlice("a", ["y", "x", "p"]));
    expect(at(graph, "p")).toEqual(inColumn(150));
    expect(at(graph, "y")).toEqual(inColumn(0));
    expect(at(graph, "x")).toEqual(inColumn(150 + HEIGHT + MARGIN));
  });

  it("restacks nothing and places a new box as before when the column gap differs", () => {
    const current = graphAt(calledSlice("a", ["x", "y"]), {
      a: A,
      x: inColumn(0),
      y: inColumn(400),
    });
    const wide = 320;
    const swapped = refresh(current, calledSlice("a", ["y", "x"]), [], wide);
    expect(swapped.graph.positions).toEqual(current.positions);
    const { graph, added } = refresh(
      current,
      calledSlice("a", ["y", "x", "n"]),
      [],
      wide,
    );
    expect(at(graph, "x")).toEqual(inColumn(0));
    expect(at(graph, "y")).toEqual(inColumn(400));
    expect(at(graph, "n")?.x).toBe(A.x - (NODE_WIDTH + wide));
    expect(added).toEqual([id("n")]);
  });

  describe("a new box two functions list", () => {
    const beside = { a: A, b: { x: A.x, y: 600 } };

    it("is restacked once, into the first function's group, and added once", () => {
      const current = graphAt(
        calledSlice("a", ["x"], ["b"]),
        { ...beside, x: inColumn(0), w: inColumn(800) },
        [],
        [calledSlice("b", ["w"])],
      );
      const { graph, added } = refresh(
        current,
        calledSlice("a", ["x", "n"], ["b"]),
        [calledSlice("b", ["n", "w"])],
      );
      expect(at(graph, "x")).toEqual(inColumn(0));
      expect(at(graph, "n")).toEqual(inColumn(ROW));
      expect(at(graph, "w")).toEqual(inColumn(800));
      expect(added).toEqual([id("n")]);
    });

    it("is not a member of a later function's group in the same column", () => {
      const current = graphAt(
        calledSlice("a", ["x"], ["b"]),
        { ...beside, x: inColumn(0) },
        [],
        [calledSlice("b", ["x"])],
      );
      const { graph } = refresh(
        current,
        calledSlice("a", ["x", "n", "n2"], ["b"]),
        [calledSlice("b", ["n2", "n"])],
      );
      expect(at(graph, "n")).toEqual(inColumn(ROW));
      expect(at(graph, "n2")).toEqual(inColumn(2 * ROW));
    });
  });
});
