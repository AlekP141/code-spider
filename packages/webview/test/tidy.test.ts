import { describe, expect, it } from "vitest";
import {
  isClear,
  type Rect,
  type Size,
} from "../src/graph/placement.js";
import { rowGap } from "../src/column-gap.js";
import { tidyPositions } from "../src/graph/tidy.js";
import type { Point } from "../src/view/types.js";
import { mulberry32, randomInt } from "./support/random.js";

const MARGIN = rowGap(192);
const size: Size = { width: 320, height: 100 };
const sizes = { a: size, b: size, c: size, d: size };
const elk = {
  a: { x: 0, y: 0 },
  b: { x: 0, y: 132 },
  c: { x: 512, y: 0 },
  d: { x: 512, y: 132 },
};

describe("tidyPositions", () => {
  it("keeps ELK's layout when nothing is pinned", () => {
    expect(tidyPositions({ elk, sizes, pinned: {}, margin: MARGIN })).toEqual(elk);
  });

  it("never moves a pinned node, whatever ELK says", () => {
    const pinned = { a: { x: 900, y: 900 } };
    const result = tidyPositions({ elk, sizes, pinned, margin: MARGIN });
    expect(result.a).toEqual({ x: 900, y: 900 });
  });

  it("keeps ELK's position for an unpinned node that is clear of every pinned one", () => {
    const result = tidyPositions({
      elk,
      sizes,
      pinned: { a: { x: 2000, y: 2000 } },
      margin: MARGIN,
    });
    expect(result.b).toEqual(elk.b);
    expect(result.c).toEqual(elk.c);
    expect(result.d).toEqual(elk.d);
  });

  it("moves a node that ELK put on a pinned one within its own column", () => {
    const pinned = { c: { x: 0, y: 40 } };
    const result = tidyPositions({ elk, sizes, pinned, margin: MARGIN });
    expect(result.c).toEqual({ x: 0, y: 40 });
    expect(result.a).toEqual({ x: 0, y: -92 });
    expect(result.b).toEqual({ x: 0, y: 172 });
    expect(result.d).toEqual(elk.d);
  });

  it("places displaced nodes in (x, y, id) order, each clear of those placed before it", () => {
    const result = tidyPositions({
      elk: { p: { x: 0, y: 10 }, q: { x: 0, y: 10 } },
      sizes: { p: size, q: size, pin: size },
      pinned: { pin: { x: 0, y: 0 } },
      margin: MARGIN,
    });
    expect(result.p).toEqual({ x: 0, y: 132 });
    expect(result.q).toEqual({ x: 0, y: -132 });
  });

  it("orders displaced nodes by y, not by id", () => {
    const result = tidyPositions({
      elk: { a: { x: 0, y: 60 }, b: { x: 0, y: 10 } },
      sizes: { a: size, b: size, pin: size },
      pinned: { pin: { x: 0, y: 0 } },
      margin: MARGIN,
    });
    expect(result.b).toEqual({ x: 0, y: 132 });
    expect(result.a).toEqual({ x: 0, y: -132 });
  });

  it("does not change its inputs", () => {
    const input = {
      elk,
      sizes,
      pinned: { c: { x: 0, y: 40 } },
      margin: MARGIN,
    };
    const snapshot = structuredClone(input);
    tidyPositions(input);
    expect(input).toEqual(snapshot);
  });

  it("returns a position for every node it was given a size for", () => {
    const result = tidyPositions({
      elk,
      sizes,
      pinned: { b: { x: 5, y: 5 } },
      margin: MARGIN,
    });
    expect(Object.keys(result).sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("tidyPositions with a different row gap", () => {
  it.each([32, 192, 480])(
    "clears a pinned box by the row gap at column gap %i",
    (columnGap) => {
      const margin = rowGap(columnGap);
      const result = tidyPositions({
        elk: { p: { x: 0, y: 10 } },
        sizes: { p: size, pin: size },
        pinned: { pin: { x: 0, y: 0 } },
        margin,
      });
      expect(result.p).toEqual({ x: 0, y: 100 + margin });
    },
  );
});

describe("tidyPositions on random layouts", () => {
  it("leaves no overlap except between pinned nodes, and moves nodes only vertically", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = mulberry32(seed);
      const margin = [16, 32, 80][seed % 3] ?? MARGIN;
      const sized: Record<string, Size> = {};
      const laid: Record<string, Point> = {};
      for (let column = randomInt(next, 1, 4); column > 0; column -= 1) {
        let y = 0;
        for (let row = randomInt(next, 1, 6); row > 0; row -= 1) {
          const id = `c${column}r${row}`;
          const height = randomInt(next, 28, 300);
          sized[id] = { width: 320, height };
          laid[id] = { x: column * 512, y };
          y += height + margin;
        }
      }
      const ids = Object.keys(sized);
      const pinned: Record<string, Point> = {};
      for (const id of ids) {
        if (next() < 0.3) {
          pinned[id] = {
            x: randomInt(next, 0, 2200),
            y: randomInt(next, -200, 1200),
          };
        }
      }

      const result = tidyPositions({
        elk: laid,
        sizes: sized,
        pinned,
        margin,
      });

      const rectOf = (id: string): Rect => ({
        ...(result[id] ?? { x: 0, y: 0 }),
        ...(sized[id] ?? size),
      });
      for (const id of ids) {
        const pin = pinned[id];
        if (pin) {
          expect(result[id], `seed ${seed} ${id} pinned`).toEqual(pin);
          continue;
        }
        expect(result[id]?.x, `seed ${seed} ${id} column`).toBe(laid[id]?.x);
        const wasClear = Object.keys(pinned).every((other) =>
          isClear(
            { ...(laid[id] ?? { x: 0, y: 0 }), ...(sized[id] ?? size) },
            { ...(pinned[other] ?? { x: 0, y: 0 }), ...(sized[other] ?? size) },
            margin,
          ),
        );
        if (wasClear) {
          expect(result[id], `seed ${seed} ${id} kept`).toEqual(laid[id]);
        }
      }
      for (const [index, id] of ids.entries()) {
        for (const other of ids.slice(index + 1)) {
          if (pinned[id] && pinned[other]) continue;
          expect(
            isClear(rectOf(id), rectOf(other), margin),
            `seed ${seed} ${id} vs ${other}`,
          ).toBe(true);
        }
      }
    }
  });
});
