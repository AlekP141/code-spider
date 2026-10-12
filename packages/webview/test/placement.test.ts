import { describe, expect, it } from "vitest";
import { rowGap } from "../src/column-gap.js";
import { NODE_WIDTH } from "../src/graph/constants.js";
import {
  isClear,
  nearestFreeY,
  placeExpansion,
  stackTops,
  type AddedNode,
  type Rect,
} from "../src/graph/placement.js";
import { edge, rect } from "./support/geometry.js";

const MARGIN = rowGap(192);

describe("isClear", () => {
  it("is true when the horizontal or the vertical gap reaches the margin", () => {
    const a = rect(0, 0, 100, 100);
    expect(isClear(a, rect(132, 0, 100, 100), 32)).toBe(true);
    expect(isClear(a, rect(0, 132, 100, 100), 32)).toBe(true);
    expect(isClear(rect(132, 0, 100, 100), a, 32)).toBe(true);
  });

  it("is false when the gap is less than the margin, touching or overlapping", () => {
    const a = rect(0, 0, 100, 100);
    expect(isClear(a, rect(131, 0, 100, 100), 32)).toBe(false);
    expect(isClear(a, rect(100, 0, 100, 100), 32)).toBe(false);
    expect(isClear(a, rect(50, 50, 100, 100), 32)).toBe(false);
    expect(isClear(a, a, 32)).toBe(false);
  });

  it("is clear in one axis even when the rectangles overlap in the other", () => {
    expect(isClear(rect(0, 0, 100, 100), rect(50, 200, 100, 100), 32)).toBe(
      true,
    );
  });
});

describe("nearestFreeY", () => {
  const column = { x: 0, width: 100, height: 50 };
  const blocker = rect(0, 100, 100, 100);

  it("keeps the preferred y when it is free", () => {
    expect(nearestFreeY(400, column, [blocker], 32)).toBe(400);
    expect(nearestFreeY(400, column, [], 32)).toBe(400);
  });

  it("moves down when the lower end of the blocked interval is nearer", () => {
    expect(nearestFreeY(140, column, [blocker], 32)).toBe(232);
  });

  it("moves up when the upper end is nearer", () => {
    expect(nearestFreeY(80, column, [blocker], 32)).toBe(18);
  });

  it("sends a tie up", () => {
    expect(nearestFreeY(125, column, [blocker], 32)).toBe(18);
  });

  it("ignores obstacles in other columns", () => {
    expect(nearestFreeY(140, column, [rect(200, 100, 100, 100)], 32)).toBe(140);
  });

  it("moves past an end that another obstacle blocks", () => {
    const second = rect(0, 240, 100, 100);
    expect(nearestFreeY(140, column, [blocker, second], 32)).toBe(18);
    expect(nearestFreeY(300, column, [blocker, second], 32)).toBe(372);
  });
});

describe("stackTops", () => {
  it("centres a single node and a stack on the given line", () => {
    expect(stackTops(100, [40], 32)).toEqual([80]);
    expect(stackTops(100, [40, 60], 32)).toEqual([
      100 - (40 + 32 + 60) / 2,
      100 - (40 + 32 + 60) / 2 + 72,
    ]);
    expect(stackTops(100, [], 32)).toEqual([]);
  });

  it("spaces the stack by the margin it is given", () => {
    const [first = 0, second = 0] = stackTops(100, [40, 60], 80);
    expect(second - first).toBe(40 + 80);
  });
});

describe("placeExpansion", () => {
  const anchor = rect(1000, 500, NODE_WIDTH, 100);
  const pitch = NODE_WIDTH + 192;
  const node = (id: string, height = 100): AddedNode => ({ id, height });
  const place = (
    added: AddedNode[],
    edges: ReturnType<typeof edge>[],
    existing: Rect[] = [anchor],
    columnGap = 192,
  ) =>
    placeExpansion({
      expandedId: "x",
      anchor,
      added,
      edges,
      existing,
      columnGap,
    });

  it("puts suppliers a column to the left and consumers a column to the right", () => {
    const placed = place(
      [node("s", 100), node("c", 60)],
      [edge("s", "x"), edge("x", "c")],
    );
    expect(placed).toEqual({
      s: { x: 1000 - pitch, y: 500 },
      c: { x: 1000 + pitch, y: 520 },
    });
  });

  it("treats a node linked both ways as a supplier", () => {
    const placed = place([node("n")], [edge("x", "n"), edge("n", "x")]);
    expect(placed.n?.x).toBe(1000 - pitch);
  });

  it("stacks a column in id order, a margin apart, centred on the anchor", () => {
    const placed = place(
      [node("b"), node("a")],
      [edge("x", "a"), edge("x", "b")],
    );
    expect(placed.a).toEqual({ x: 1000 + pitch, y: 434 });
    expect(placed.b).toEqual({ x: 1000 + pitch, y: 566 });
  });

  it.each([32, 192, 480])(
    "stacks new boxes the row gap apart at column gap %i",
    (columnGap) => {
      const placed = place(
        [node("a"), node("b"), node("c")],
        [edge("x", "a"), edge("x", "b"), edge("x", "c")],
        [anchor],
        columnGap,
      );
      const tops = ["a", "b", "c"].map((name) => placed[name]?.y ?? 0);
      expect(tops[1]).toBe((tops[0] ?? 0) + 100 + rowGap(columnGap));
      expect(tops[2]).toBe((tops[1] ?? 0) + 100 + rowGap(columnGap));
      expect(placed.a?.x).toBe(1000 + NODE_WIDTH + columnGap);
    },
  );

  it("clears a dragged box by the row gap at the current column gap", () => {
    const dragged = rect(1000 + NODE_WIDTH + 480, 480, NODE_WIDTH, 100);
    const placed = place([node("c")], [edge("x", "c")], [anchor, dragged], 480);
    expect(placed.c?.y).toBe(480 + 100 + 80);
  });

  it("is pushed down by a dragged node on its slot when the lower end is nearer", () => {
    const dragged = rect(1000 + pitch, 480, NODE_WIDTH, 100);
    const placed = place([node("c")], [edge("x", "c")], [anchor, dragged]);
    expect(placed.c).toEqual({ x: 1000 + pitch, y: 612 });
  });

  it("is pushed up by a dragged node on its slot when the upper end is nearer", () => {
    const dragged = rect(1000 + pitch, 530, NODE_WIDTH, 100);
    const placed = place([node("c")], [edge("x", "c")], [anchor, dragged]);
    expect(placed.c).toEqual({ x: 1000 + pitch, y: 398 });
  });

  it("keeps the nodes it places clear of each other", () => {
    const dragged = rect(1000 + pitch, 300, NODE_WIDTH, 200);
    const placed = place(
      [node("a"), node("b")],
      [edge("x", "a"), edge("x", "b")],
      [anchor, dragged],
    );
    expect(placed.a).toEqual({ x: 1000 + pitch, y: 532 });
    expect(placed.b).toEqual({ x: 1000 + pitch, y: 664 });
    const a = rect(placed.a?.x ?? 0, placed.a?.y ?? 0, NODE_WIDTH, 100);
    const b = rect(placed.b?.x ?? 0, placed.b?.y ?? 0, NODE_WIDTH, 100);
    expect(isClear(a, dragged, MARGIN)).toBe(true);
    expect(isClear(b, dragged, MARGIN)).toBe(true);
    expect(isClear(a, b, MARGIN)).toBe(true);
  });

  it("does not change its inputs", () => {
    const added = [node("b"), node("a")];
    const existing = [anchor, rect(1000 + pitch, 300, NODE_WIDTH, 200)];
    const edges = [edge("x", "a"), edge("b", "x")];
    const snapshot = structuredClone({ added, existing, edges });
    placeExpansion({
      expandedId: "x",
      anchor,
      added,
      edges,
      existing,
      columnGap: 192,
    });
    expect({ added, existing, edges }).toEqual(snapshot);
  });
});
