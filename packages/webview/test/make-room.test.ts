import { describe, expect, it } from "vitest";
import { rowGap } from "../src/column-gap.js";
import { NODE_WIDTH } from "../src/graph/constants.js";
import { makeRoom, type RoomBox } from "../src/graph/make-room.js";

const box = (id: string, x: number, y: number, height: number): RoomBox => ({
  id,
  rect: { x, y, width: NODE_WIDTH, height },
});

const none = new Set<string>();
const GAP = 192;
const MARGIN = rowGap(GAP);

describe("makeRoom", () => {
  it("moves nothing when no boxes overlap", () => {
    const boxes = [
      box("a", 0, 0, 100),
      box("b", 0, 100 + MARGIN, 100),
      box("c", NODE_WIDTH + GAP, 0, 400),
    ];
    expect(makeRoom(boxes, none, GAP)).toEqual({});
  });

  it("moves the lower box to the upper's bottom plus the margin, keeping x", () => {
    const boxes = [box("a", 40, 0, 150), box("b", 40, 100, 80)];
    expect(makeRoom(boxes, none, GAP)).toEqual({
      b: { x: 40, y: 150 + MARGIN },
    });
  });

  it("treats a box nearer than the margin as overlapping", () => {
    const boxes = [box("a", 0, 0, 100), box("b", 0, 100 + MARGIN - 1, 50)];
    expect(makeRoom(boxes, none, GAP)).toEqual({
      b: { x: 0, y: 100 + MARGIN },
    });
  });

  it("lets a pushed box push the next one", () => {
    const boxes = [
      box("a", 0, 0, 200),
      box("b", 0, 100, 60),
      box("c", 0, 140, 60),
    ];
    const bottom = 200 + MARGIN;
    expect(makeRoom(boxes, none, GAP)).toEqual({
      b: { x: 0, y: bottom },
      c: { x: 0, y: bottom + 60 + MARGIN },
    });
  });

  it("jumps a box that grew into a pinned box to below it", () => {
    const boxes = [box("a", 0, 0, 300), box("p", 0, 200, 100)];
    expect(makeRoom(boxes, new Set(["p"]), GAP)).toEqual({
      a: { x: 0, y: 200 + 100 + MARGIN },
    });
  });

  it("makes a pinned box constrain an unpinned box that sorts before it", () => {
    const boxes = [box("a", 0, 10, 100), box("p", 0, 50, 100)];
    expect(makeRoom(boxes, new Set(["p"]), GAP)).toEqual({
      a: { x: 0, y: 150 + MARGIN },
    });
  });

  it("never moves pinned boxes and leaves two overlapping pinned boxes overlapped", () => {
    const boxes = [
      box("p", 0, 0, 200),
      box("q", 0, 100, 80),
      box("u", 0, 150, 40),
    ];
    const moved = makeRoom(boxes, new Set(["p", "q"]), GAP);
    expect(Object.keys(moved)).toEqual(["u"]);
    expect(moved.u).toEqual({ x: 0, y: 200 + MARGIN });
  });

  it("orders ties on top by x, then by id", () => {
    const byX = [box("z", 0, 0, 100), box("a", 10, 0, 100)];
    expect(makeRoom(byX, none, GAP)).toEqual({
      a: { x: 10, y: 100 + MARGIN },
    });
    const byId = [box("b", 5, 0, 100), box("a", 5, 0, 100)];
    expect(makeRoom(byId, none, GAP)).toEqual({
      b: { x: 5, y: 100 + MARGIN },
    });
  });

  it("uses the margin that rowGap gives at gaps 32, 192 and 480", () => {
    for (const gap of [32, 192, 480]) {
      const boxes = [box("a", 0, 0, 100), box("b", 0, 50, 100)];
      expect(makeRoom(boxes, none, gap).b?.y).toBe(100 + rowGap(gap));
    }
  });

  it("does not depend on the order of the boxes it is given", () => {
    const boxes = [
      box("c", 0, 140, 60),
      box("a", 0, 0, 200),
      box("b", 0, 100, 60),
    ];
    expect(makeRoom(boxes, none, GAP)).toEqual(
      makeRoom([...boxes].reverse(), none, GAP),
    );
  });

  it("does not change its input", () => {
    const boxes = [box("a", 0, 0, 200), box("b", 0, 100, 60)];
    const before = structuredClone(boxes);
    makeRoom(boxes, none, GAP);
    expect(boxes).toEqual(before);
  });
});
