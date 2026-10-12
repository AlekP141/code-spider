import { describe, expect, it } from "vitest";
import { TOLERANCE } from "../../../src/graph/layout/placement.js";
import { orderColumns } from "../../../src/graph/layout/order-columns.js";

const MARGIN = 32;

describe("orderColumns", () => {
  it("gives a column's slots, top to bottom, to its boxes in walk order", () => {
    const positions = {
      a: { x: 12, y: 300 },
      b: { x: 12, y: 12 },
      c: { x: 12, y: 150 },
    };
    const heights = { a: 50, b: 50, c: 50 };
    const result = orderColumns(positions, heights, ["a", "b", "c"], MARGIN);
    expect(result).toEqual({
      a: { x: 12, y: 12 },
      b: { x: 12, y: 150 },
      c: { x: 12, y: 300 },
    });
  });

  it("pushes a box down so the row gap holds when a taller box goes above it", () => {
    const positions = {
      tall: { x: 12, y: 144 },
      short: { x: 12, y: 12 },
    };
    const heights = { tall: 300, short: 50 };
    expect(
      orderColumns(positions, heights, ["short", "tall"], MARGIN),
    ).toEqual({ short: { x: 12, y: 12 }, tall: { x: 12, y: 144 } });
    expect(
      orderColumns(positions, heights, ["tall", "short"], MARGIN),
    ).toEqual({ tall: { x: 12, y: 12 }, short: { x: 12, y: 344 } });
  });

  it("never changes x, and orders two columns separately", () => {
    const positions = {
      a: { x: 12, y: 200 },
      b: { x: 12, y: 20 },
      c: { x: 556, y: 100 },
      d: { x: 556, y: 10 },
    };
    const heights = { a: 40, b: 40, c: 40, d: 40 };
    const result = orderColumns(
      positions,
      heights,
      ["d", "a", "c", "b"],
      MARGIN,
    );
    expect(result).toEqual({
      a: { x: 12, y: 20 },
      b: { x: 12, y: 200 },
      d: { x: 556, y: 10 },
      c: { x: 556, y: 100 },
    });
  });

  it("treats x values within the tolerance as one column and a larger difference as two", () => {
    const heights = { a: 40, b: 40 };
    const order = ["b", "a"];
    const same = orderColumns(
      { a: { x: 12, y: 10 }, b: { x: 12 + TOLERANCE / 2, y: 200 } },
      heights,
      order,
      MARGIN,
    );
    expect(same.b).toEqual({ x: 12 + TOLERANCE / 2, y: 10 });
    expect(same.a).toEqual({ x: 12, y: 200 });

    const apart = orderColumns(
      { a: { x: 12, y: 10 }, b: { x: 12 + TOLERANCE * 4, y: 200 } },
      heights,
      order,
      MARGIN,
    );
    expect(apart.a).toEqual({ x: 12, y: 10 });
    expect(apart.b).toEqual({ x: 12 + TOLERANCE * 4, y: 200 });
  });

  it("puts an id missing from the order after the listed ones, in id order", () => {
    const positions = {
      z: { x: 0, y: 0 },
      m: { x: 0, y: 100 },
      listed: { x: 0, y: 200 },
      a: { x: 0, y: 300 },
    };
    const heights = { z: 20, m: 20, listed: 20, a: 20 };
    const result = orderColumns(positions, heights, ["listed"], MARGIN);
    const top = (id: keyof typeof result) => result[id]?.y ?? Number.NaN;
    expect(top("listed")).toBe(0);
    expect(top("a")).toBe(100);
    expect(top("m")).toBe(200);
    expect(top("z")).toBe(300);
  });

  it("follows the margin it is given", () => {
    const positions = { a: { x: 0, y: 0 }, b: { x: 0, y: 60 } };
    const heights = { a: 100, b: 100 };
    for (const margin of [16, 32, 80]) {
      const result = orderColumns(positions, heights, ["a", "b"], margin);
      expect(result.b?.y).toBe(100 + margin);
    }
  });

  it("changes none of its inputs and gives an empty result for an empty input", () => {
    const positions = { a: { x: 1, y: 50 }, b: { x: 1, y: 0 } };
    const heights = { a: 30, b: 30 };
    const order = ["a", "b"];
    const result = orderColumns(positions, heights, order, MARGIN);
    expect(positions).toEqual({ a: { x: 1, y: 50 }, b: { x: 1, y: 0 } });
    expect(heights).toEqual({ a: 30, b: 30 });
    expect(order).toEqual(["a", "b"]);
    expect(result.a).not.toBe(positions.a);
    expect(orderColumns({}, {}, [], MARGIN)).toEqual({});
  });
});
