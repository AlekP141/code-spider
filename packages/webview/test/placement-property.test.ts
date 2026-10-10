import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../src/graph/constants.js";
import {
  isClear,
  NODE_MARGIN,
  placeExpansion,
  stackTops,
  type AddedNode,
  type Rect,
} from "../src/graph/placement.js";
import { mulberry32, randomInt } from "./support/random.js";

const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x,
  y,
  width,
  height,
});

describe("placeExpansion on random layouts", () => {
  function nearerClearExists(
    preferred: number,
    chosen: number,
    column: { x: number; height: number },
    obstacles: readonly Rect[],
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
        obstacles.every((obstacle) => isClear(candidate, obstacle, NODE_MARGIN))
      ) {
        return true;
      }
    }
    return false;
  }

  it("places every node in its column, clear of everything, as near as it can", () => {
    for (let seed = 1; seed <= 300; seed += 1) {
      const next = mulberry32(seed);
      const anchor = rect(
        randomInt(next, -600, 600),
        randomInt(next, -600, 600),
        NODE_WIDTH,
        randomInt(next, 28, 300),
      );
      const columnGap = 16 * randomInt(next, 2, 30);
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
      const edges: { from: string; to: string }[] = [];
      for (let index = randomInt(next, 0, 12); index > 0; index -= 1) {
        const id = `n${String(index).padStart(2, "0")}`;
        added.push({ id, height: randomInt(next, 28, 450) });
        edges.push(
          next() < 0.5 ? { from: id, to: "x" } : { from: "x", to: id },
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

      const isSupplier = (id: string) =>
        edges.some((edge) => edge.from === id && edge.to === "x");
      const byId = (a: AddedNode, b: AddedNode) => a.id.localeCompare(b.id);
      const order = [
        ...added.filter((n) => isSupplier(n.id)).sort(byId),
        ...added.filter((n) => !isSupplier(n.id)).sort(byId),
      ];
      expect(Object.keys(placed).sort(), `seed ${seed}`).toEqual(
        added.map((n) => n.id).sort(),
      );

      const centre = anchor.y + anchor.height / 2;
      const obstacles = [...existing];
      for (const supplier of [true, false]) {
        const stack = order.filter((n) => isSupplier(n.id) === supplier);
        const tops = stackTops(
          centre,
          stack.map((n) => n.height),
        );
        stack.forEach((n, index) => {
          const at = placed[n.id];
          const x = supplier ? columns[0] : columns[1];
          expect(at?.x, `seed ${seed} ${n.id} column`).toBe(x);
          const placedRect = rect(at?.x ?? 0, at?.y ?? 0, NODE_WIDTH, n.height);
          for (const obstacle of obstacles) {
            expect(
              isClear(placedRect, obstacle, NODE_MARGIN),
              `seed ${seed} ${n.id} clear`,
            ).toBe(true);
          }
          expect(
            nearerClearExists(
              tops[index] ?? 0,
              at?.y ?? 0,
              { x: x ?? 0, height: n.height },
              obstacles,
            ),
            `seed ${seed} ${n.id} optimal`,
          ).toBe(false);
          obstacles.push(placedRect);
        });
      }
    }
  });
});
