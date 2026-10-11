import { describe, expect, it } from "vitest";
import { rowGap } from "../src/column-gap.js";
import { NODE_WIDTH } from "../src/graph/constants.js";
import {
  placeExpansion,
  type AddedNode,
  type Rect,
} from "../src/graph/placement.js";
import { site } from "./support/slices.js";

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

const edge = (from: string, to: string, line: number) => ({
  from,
  to,
  callSite: site(line),
});

const anchor = rect(1000, 500, NODE_WIDTH, 100);
const pitch = (columnGap: number) => NODE_WIDTH + columnGap;
const LEFT = 1000 - pitch(192);
const RIGHT = 1000 + pitch(192);

function place(
  added: AddedNode[],
  edges: ReturnType<typeof edge>[],
  existing: Rect[] = [anchor],
  columnGap = 192,
) {
  return placeExpansion({
    expandedId: "x",
    anchor,
    added,
    edges,
    existing,
    columnGap,
  });
}

const boxes = (...heights: [string, number][]): AddedNode[] =>
  heights.map(([id, height]) => ({ id, height }));

const suppliersInCodeOrder = (ids: string[]) =>
  ids.map((id, index) => edge(id, "x", index + 1));

describe("placeExpansion order", () => {
  it("stacks suppliers in code order, not id order", () => {
    const placed = place(
      boxes(["a", 100], ["m", 100], ["z", 100]),
      suppliersInCodeOrder(["z", "m", "a"]),
    );
    expect(placed).toEqual({
      z: { x: LEFT, y: 368 },
      m: { x: LEFT, y: 500 },
      a: { x: LEFT, y: 632 },
    });
  });

  it("stacks consumers in id order whatever order the code reads them", () => {
    const placed = place(boxes(["c", 100], ["a", 100], ["b", 100]), [
      edge("x", "c", 1),
      edge("x", "a", 2),
      edge("x", "b", 3),
    ]);
    expect(placed).toEqual({
      a: { x: RIGHT, y: 368 },
      b: { x: RIGHT, y: 500 },
      c: { x: RIGHT, y: 632 },
    });
  });

  it("centres the stack on the anchor, a margin apart, with unequal heights", () => {
    const placed = place(
      boxes(["b", 140], ["a", 60]),
      suppliersInCodeOrder(["a", "b"]),
    );
    expect(placed).toEqual({
      a: { x: LEFT, y: 434 },
      b: { x: LEFT, y: 526 },
    });
  });

  it("puts a box that is both called and calling in the called column", () => {
    const placed = place(boxes(["n", 100]), [
      edge("x", "n", 1),
      edge("n", "x", 2),
    ]);
    expect(placed.n?.x).toBe(LEFT);
  });

  it("sends the first box to the nearest free place, a tie going up, and keeps the rest in order", () => {
    const blocker = rect(LEFT, 368, NODE_WIDTH, 100);
    const placed = place(
      boxes(["c", 100], ["a", 100], ["b", 100]),
      suppliersInCodeOrder(["c", "a", "b"]),
      [anchor, blocker],
    );
    expect(placed).toEqual({
      c: { x: LEFT, y: 236 },
      a: { x: LEFT, y: 500 },
      b: { x: LEFT, y: 632 },
    });
  });

  it("sends the first box down when the lower end is nearer and the rest below it", () => {
    const blocker = rect(LEFT, 340, NODE_WIDTH, 50);
    const placed = place(
      boxes(["c", 100], ["a", 100], ["b", 100]),
      suppliersInCodeOrder(["c", "a", "b"]),
      [anchor, blocker],
    );
    expect(placed).toEqual({
      c: { x: LEFT, y: 422 },
      a: { x: LEFT, y: 554 },
      b: { x: LEFT, y: 686 },
    });
  });

  it.each([
    {
      name: "a short first box over an obstacle that blocks the second slot",
      blocker: rect(LEFT, 584, NODE_WIDTH, 200),
      heights: [84, 200, 200],
      tops: [276, 816, 1048],
    },
    {
      name: "tall boxes with an obstacle that the second box cannot fit above",
      blocker: rect(LEFT, 730, NODE_WIDTH, 84),
      heights: [200, 200, 100],
      tops: [268, 846, 1078],
    },
  ])("keeps code order past an obstacle in the middle: $name", (layout) => {
    const added = ["c", "a", "b"].map((id, index) => ({
      id,
      height: layout.heights[index] ?? 0,
    }));
    const placed = place(
      added,
      suppliersInCodeOrder(["c", "a", "b"]),
      [anchor, layout.blocker],
    );
    expect([placed.c?.y, placed.a?.y, placed.b?.y]).toEqual(layout.tops);
  });

  it("leaves every box on one side of an obstacle that covers the whole stack, in order", () => {
    const blocker = rect(LEFT, 300, NODE_WIDTH, 500);
    const placed = place(
      boxes(["c", 100], ["a", 100], ["b", 100]),
      suppliersInCodeOrder(["c", "a", "b"]),
      [anchor, blocker],
    );
    expect(placed).toEqual({
      c: { x: LEFT, y: 168 },
      a: { x: LEFT, y: 832 },
      b: { x: LEFT, y: 964 },
    });
  });

  it("keeps a small later box below a large earlier one that jumped an obstacle", () => {
    const placed = place(
      boxes(["c", 300], ["a", 28]),
      suppliersInCodeOrder(["c", "a"]),
      [
        anchor,
        rect(LEFT, 100, NODE_WIDTH, 570),
        rect(LEFT, 762, NODE_WIDTH, 38),
      ],
    );
    expect(placed).toEqual({
      c: { x: LEFT, y: 832 },
      a: { x: LEFT, y: 1164 },
    });
  });

  it("applies the same rule to the consumer column", () => {
    const blocker = rect(RIGHT, 584, NODE_WIDTH, 200);
    const placed = place(
      boxes(["a", 84], ["b", 200], ["c", 200]),
      [edge("x", "a", 1), edge("x", "b", 2), edge("x", "c", 3)],
      [anchor, blocker],
    );
    expect([placed.a?.y, placed.b?.y, placed.c?.y]).toEqual([276, 816, 1048]);
  });

  it("places a supplier with two edges at its earliest site", () => {
    const placed = place(boxes(["p", 100], ["q", 100]), [
      edge("p", "x", 3),
      edge("q", "x", 8),
      edge("q", "x", 1),
    ]);
    expect(placed.q?.y).toBeLessThan(placed.p?.y ?? 0);
  });

  it.each([32, 192, 480])(
    "keeps code order and the row gap at column gap %i",
    (columnGap) => {
      const placed = place(
        boxes(["c", 100], ["a", 100], ["b", 100]),
        suppliersInCodeOrder(["c", "a", "b"]),
        [anchor],
        columnGap,
      );
      const step = 100 + rowGap(columnGap);
      const tops = ["c", "a", "b"].map((id) => placed[id]?.y ?? 0);
      expect(tops[1]).toBe((tops[0] ?? 0) + step);
      expect(tops[2]).toBe((tops[1] ?? 0) + step);
      expect(placed.c?.x).toBe(1000 - pitch(columnGap));
    },
  );
});
