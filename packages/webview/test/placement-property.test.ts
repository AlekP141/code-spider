import type { Range } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { rowGap } from "../src/settings/column-gap.js";
import { calledInOrder } from "../src/graph/call-order.js";
import { compareIds } from "../src/graph/compare-ids.js";
import { NODE_WIDTH } from "../src/graph/constants.js";
import {
  isClear,
  placeExpansion,
  stackTops,
  type AddedNode,
  type Rect,
} from "../src/graph/placement.js";
import { rect } from "./support/geometry.js";
import { mulberry32, randomInt } from "./support/random.js";
import { site } from "./support/slices.js";

describe("placeExpansion on random layouts", () => {
  function nearerClearExists(
    preferred: number,
    chosen: number,
    column: { x: number; height: number },
    obstacles: readonly Rect[],
    margin: number,
  ): boolean {
    const reach = Math.abs(chosen - preferred);
    for (
      let y = Math.floor(preferred - reach);
      y <= Math.ceil(preferred + reach);
      y += 1
    ) {
      const distance = Math.abs(y - preferred);
      const nearer = distance < reach || (distance === reach && y < chosen);
      const candidate = rect(column.x, y, NODE_WIDTH, column.height);
      if (
        nearer &&
        obstacles.every((obstacle) => isClear(candidate, obstacle, margin))
      ) {
        return true;
      }
    }
    return false;
  }

  function clearBetween(
    from: number,
    to: number,
    column: { x: number; height: number },
    obstacles: readonly Rect[],
    margin: number,
  ): boolean {
    for (let y = from; y < to; y += 0.5) {
      const candidate = rect(column.x, y, NODE_WIDTH, column.height);
      if (obstacles.every((obstacle) => isClear(candidate, obstacle, margin))) {
        return true;
      }
    }
    return false;
  }

  it("places every node in its column, clear of everything, as near as the order allows", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = mulberry32(seed);
      const anchor = rect(
        randomInt(next, -600, 600),
        randomInt(next, -600, 600),
        NODE_WIDTH,
        randomInt(next, 28, 300),
      );
      const columnGap = [32, 192, 480][seed % 4] ?? 16 * randomInt(next, 2, 30);
      const margin = rowGap(columnGap);
      const pitch = NODE_WIDTH + columnGap;
      const columns = [anchor.x - pitch, anchor.x + pitch];

      const existing = [anchor];
      for (let index = randomInt(next, 0, 29); index > 0; index -= 1) {
        const near = next() < 0.7;
        const x = near
          ? (columns[randomInt(next, 0, 1)] ?? 0) + randomInt(next, -200, 200)
          : randomInt(next, -1500, 1500);
        existing.push(
          rect(
            x,
            anchor.y + randomInt(next, -700, 700),
            NODE_WIDTH,
            randomInt(next, 28, 450),
          ),
        );
      }

      const added: AddedNode[] = [];
      const edges: { from: string; to: string; callSite: Range }[] = [];
      for (let index = randomInt(next, 0, 12); index > 0; index -= 1) {
        const id = `n${String(index).padStart(2, "0")}`;
        added.push({ id, height: randomInt(next, 28, 450) });
        const callSite = site(randomInt(next, 1, 30));
        edges.push(
          next() < 0.5
            ? { from: id, to: "x", callSite }
            : { from: "x", to: id, callSite },
        );
      }

      const placed = placeExpansion({
        expandedId: "x",
        anchor,
        added,
        edges,
        existing,
        columnGap,
      });

      const supplierIds = calledInOrder("x", edges);
      const order = [
        ...supplierIds.flatMap((id) => added.filter((n) => n.id === id)),
        ...added
          .filter((n) => !supplierIds.includes(n.id))
          .sort((a, b) => compareIds(a.id, b.id)),
      ];
      expect(Object.keys(placed).sort(), `seed ${seed}`).toEqual(
        added.map((n) => n.id).sort(),
      );

      const centre = anchor.y + anchor.height / 2;
      const obstacles = [...existing];
      for (const supplier of [true, false]) {
        let previousBottom = Number.NEGATIVE_INFINITY;
        const stack = order.filter(
          (n) => supplierIds.includes(n.id) === supplier,
        );
        const tops = stackTops(
          centre,
          stack.map((n) => n.height),
          margin,
        );
        stack.forEach((n, index) => {
          const at = placed[n.id];
          const x = supplier ? columns[0] : columns[1];
          expect(at?.x, `seed ${seed} ${n.id} column`).toBe(x);
          const placedRect = rect(at?.x ?? 0, at?.y ?? 0, NODE_WIDTH, n.height);
          for (const obstacle of obstacles) {
            expect(
              isClear(placedRect, obstacle, margin),
              `seed ${seed} ${n.id} clear`,
            ).toBe(true);
          }
          const preferred = tops[index] ?? 0;
          const column = { x: x ?? 0, height: n.height };
          if (index === 0) {
            expect(
              nearerClearExists(
                preferred,
                at?.y ?? 0,
                column,
                obstacles,
                margin,
              ),
              `seed ${seed} ${n.id} optimal`,
            ).toBe(false);
          } else {
            const bound = Math.max(preferred, previousBottom + margin);
            expect(
              at?.y ?? 0,
              `seed ${seed} ${n.id} bound`,
            ).toBeGreaterThanOrEqual(bound);
            expect(
              clearBetween(bound, at?.y ?? 0, column, obstacles, margin),
              `seed ${seed} ${n.id} lowest`,
            ).toBe(false);
          }
          previousBottom = placedRect.y + n.height;
          obstacles.push(placedRect);
        });
      }
    }
  });
});
