import { describe, expect, it } from "vitest";
import { calledSlice, id, tweakNode } from "./support/graph-states.js";
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

describe("rebuildGraph puts called boxes in code order", () => {
  it("moves nothing and adds nothing when the code is unchanged, even with far apart boxes", () => {
    const centre = calledSlice("a", ["x", "y"], ["b"]);
    const current = graphAt(centre, {
      a: A,
      x: inColumn(0),
      y: inColumn(400),
      b: { x: A.x + PITCH, y: 0 },
    });
    const { graph, added } = refresh(current, centre);
    expect(graph.positions).toEqual(current.positions);
    expect(added).toEqual([]);
  });

  it("swaps two calls that swapped and leaves the rest where they were", () => {
    const before = calledSlice("a", ["x", "y"], ["b"]);
    const current = graphAt(before, {
      a: A,
      x: inColumn(0),
      y: inColumn(400),
      b: { x: A.x + PITCH, y: 50 },
    });
    const { graph, added } = refresh(
      current,
      calledSlice("a", ["y", "x"], ["b"]),
    );
    expect(at(graph, "y")).toEqual(inColumn(0));
    expect(at(graph, "x")).toEqual(inColumn(ROW));
    expect(at(graph, "a")).toEqual(A);
    expect(at(graph, "b")).toEqual({ x: A.x + PITCH, y: 50 });
    expect(added).toEqual([]);
  });

  it("inserts a new call between two existing ones and slides the box below down", () => {
    const current = graphAt(calledSlice("a", ["x", "y"]), {
      a: A,
      x: inColumn(0),
      y: inColumn(ROW),
    });
    const { graph, added } = refresh(
      current,
      calledSlice("a", ["x", "n", "y"]),
    );
    expect(at(graph, "x")).toEqual(inColumn(0));
    expect(at(graph, "n")).toEqual(inColumn(ROW));
    expect(at(graph, "y")).toEqual(inColumn(2 * ROW));
    expect(added).toEqual([id("n")]);
  });

  it("closes the gap when the existing boxes were far apart", () => {
    const current = graphAt(calledSlice("a", ["x", "y"]), {
      a: A,
      x: inColumn(0),
      y: inColumn(400),
    });
    const { graph } = refresh(current, calledSlice("a", ["x", "n", "y"]));
    expect(at(graph, "n")).toEqual(inColumn(ROW));
    expect(at(graph, "y")).toEqual(inColumn(2 * ROW));
  });

  it("puts a new call after the last one below it and moves no existing box", () => {
    const current = graphAt(calledSlice("a", ["x", "y"]), {
      a: A,
      x: inColumn(0),
      y: inColumn(ROW),
    });
    const { graph, added } = refresh(
      current,
      calledSlice("a", ["x", "y", "n"]),
    );
    expect(at(graph, "x")).toEqual(inColumn(0));
    expect(at(graph, "y")).toEqual(inColumn(ROW));
    expect(at(graph, "n")).toEqual(inColumn(2 * ROW));
    expect(added).toEqual([id("n")]);
  });

  it("gives a new call before the first one the top of the group", () => {
    const current = graphAt(calledSlice("a", ["x", "y"]), {
      a: A,
      x: inColumn(0),
      y: inColumn(ROW),
    });
    const { graph } = refresh(current, calledSlice("a", ["n", "x", "y"]));
    expect(at(graph, "n")).toEqual(inColumn(0));
    expect(at(graph, "x")).toEqual(inColumn(ROW));
    expect(at(graph, "y")).toEqual(inColumn(2 * ROW));
  });

  it("restacks a graph laid out in id order on the first refresh and nothing on the second", () => {
    const names = ["x", "y", "z"];
    const current = graphAt(calledSlice("a", names), {
      a: A,
      x: inColumn(0),
      y: inColumn(ROW),
      z: inColumn(2 * ROW),
    });
    const centre = calledSlice("a", ["z", "y", "x"]);
    const first = refresh(current, centre);
    expect(at(first.graph, "z")).toEqual(inColumn(0));
    expect(at(first.graph, "y")).toEqual(inColumn(ROW));
    expect(at(first.graph, "x")).toEqual(inColumn(2 * ROW));
    const second = refresh(first.graph, centre);
    expect(second.graph.positions).toEqual(first.graph.positions);
    expect(second.added).toEqual([]);
  });

  describe("make-room keeps a group in order", () => {
    const TALL = 356;
    const BELOW = 520 + HEIGHT + MARGIN;
    const grown = tweakNode(calledSlice("a", ["m1", "m2", "p", "q"]), "m1", {
      lineCount: 20,
    });

    it("keeps a restacked group in order when a pinned box pushes its first member past the next", () => {
      const current = graphAt(
        grown,
        {
          a: A,
          m2: inColumn(0),
          m1: inColumn(400),
          p: inColumn(20),
          q: inColumn(520),
        },
        ["p", "q"],
      );
      const { graph } = refresh(current, grown);
      expect(at(graph, "p")).toEqual(inColumn(20));
      expect(at(graph, "q")).toEqual(inColumn(520));
      expect(at(graph, "m1")).toEqual(inColumn(BELOW));
      expect(at(graph, "m2")).toEqual(inColumn(BELOW + TALL + MARGIN));
    });

    it("keeps a new call in its place when a pinned box pushes the box before it", () => {
      const withNew = tweakNode(
        calledSlice("a", ["m1", "n", "m2", "p", "q"]),
        "m1",
        { lineCount: 20 },
      );
      const current = graphAt(
        grown,
        {
          a: A,
          m2: inColumn(0),
          m1: inColumn(400),
          p: inColumn(20),
          q: inColumn(520),
        },
        ["p", "q"],
      );
      const { graph, added } = refresh(current, withNew);
      expect(at(graph, "m1")).toEqual(inColumn(BELOW));
      expect(at(graph, "n")).toEqual(inColumn(BELOW + TALL + MARGIN));
      expect(at(graph, "m2")).toEqual(inColumn(BELOW + TALL + ROW + MARGIN));
      expect(added).toEqual([id("n")]);
    });

    it("keeps an untouched group in order when its first member grew and is pushed past a pinned box", () => {
      const current = graphAt(
        calledSlice("a", ["m1", "m2", "p", "q"]),
        {
          a: A,
          m1: inColumn(0),
          m2: inColumn(400),
          p: inColumn(20),
          q: inColumn(520),
        },
        ["p", "q"],
      );
      const { graph, added } = refresh(current, grown);
      expect(at(graph, "m1")).toEqual(inColumn(BELOW));
      expect(at(graph, "m2")).toEqual(inColumn(BELOW + TALL + MARGIN));
      expect(added).toEqual([]);
    });
  });

  it("separates called boxes that stand at the same top", () => {
    const current = graphAt(calledSlice("a", ["m1", "m2"]), {
      a: A,
      m1: { x: COLUMN + 5e-7, y: 0 },
      m2: inColumn(0),
    });
    const { graph } = refresh(current, calledSlice("a", ["m1", "m2"]));
    expect(at(graph, "m1")?.y).toBe(0);
    expect(at(graph, "m2")?.y).toBe(ROW);
  });
});
