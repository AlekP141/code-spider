import type { Range } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { rowGap } from "../src/column-gap.js";
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

const clearOfAll = (candidate: Rect, obstacles: readonly Rect[], gap: number) =>
  obstacles.every((obstacle) => isClear(candidate, obstacle, gap));

function nearerClearExists(
  preferred: number,
  chosen: number,
  column: { x: number; height: number },
  obstacles: readonly Rect[],
  margin: number,
): boolean {
  const reach = Math.abs(chosen - preferred);
  for (let y = preferred - reach; y <= preferred + reach; y += 0.5) {
    const distance = Math.abs(y - preferred);
    const nearer = distance < reach || (distance === reach && y < chosen);
    const candidate = rect(column.x, y, NODE_WIDTH, column.height);
    if (nearer && clearOfAll(candidate, obstacles, margin)) return true;
  }
  return false;
}

function clearYBetween(
  from: number,
  to: number,
  column: { x: number; height: number },
  obstacles: readonly Rect[],
  margin: number,
): boolean {
  for (let y = from; y < to; y += 0.5) {
    const candidate = rect(column.x, y, NODE_WIDTH, column.height);
    if (clearOfAll(candidate, obstacles, margin)) return true;
  }
  return false;
}

describe("placeExpansion on random layouts", () => {
  it.each([32, 192, 480])(
    "keeps each column in order, clear and as high as it can go at column gap %i",
    (columnGap) => {
      const margin = rowGap(columnGap);
      const pitch = NODE_WIDTH + columnGap;
      for (let seed = 1; seed <= 100; seed += 1) {
        const next = mulberry32(seed * 1009 + columnGap);
        const anchor = rect(
          randomInt(next, -600, 600),
          randomInt(next, -600, 600),
          NODE_WIDTH,
          randomInt(next, 28, 300),
        );
        const columns = [anchor.x - pitch, anchor.x + pitch];

        const existing = [anchor];
        for (let index = randomInt(next, 0, 14); index > 0; index -= 1) {
          const x =
            next() < 0.7
              ? (columns[randomInt(next, 0, 1)] ?? 0) +
                randomInt(next, -200, 200)
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
        for (let index = randomInt(next, 0, 10); index > 0; index -= 1) {
          const id = `n${randomInt(next, 10, 99)}-${index}`;
          added.push({ id, height: randomInt(next, 28, 450) });
          const asSupplier = next() < 0.5;
          for (let count = randomInt(next, 1, 3); count > 0; count -= 1) {
            const callSite = site(
              randomInt(next, 1, 30),
              randomInt(next, 1, 40),
            );
            edges.push(
              asSupplier
                ? { from: id, to: "x", callSite }
                : { from: "x", to: id, callSite },
            );
          }
        }

        const placed = placeExpansion({
          expandedId: "x",
          anchor,
          added,
          edges,
          existing,
          columnGap,
        });
        expect(Object.keys(placed).sort()).toEqual(
          added.map((node) => node.id).sort(),
        );

        const heightOf = (id: string) =>
          added.find((node) => node.id === id)?.height ?? 0;
        const leftIds = calledInOrder("x", edges);
        const rightIds = added
          .map((node) => node.id)
          .filter((id) => !leftIds.includes(id))
          .sort(compareIds);
        expect(leftIds.length + rightIds.length).toBe(added.length);

        const centre = anchor.y + anchor.height / 2;
        const obstacles = [...existing];
        for (const [stack, x] of [
          [leftIds, columns[0] ?? 0],
          [rightIds, columns[1] ?? 0],
        ] as const) {
          const tops = stackTops(centre, stack.map(heightOf), margin);
          let previousBottom = Number.NEGATIVE_INFINITY;
          stack.forEach((id, index) => {
            const at = placed[id] ?? { x: 0, y: 0 };
            const height = heightOf(id);
            const label = `seed ${seed} gap ${columnGap} ${id}`;
            expect(at.x, label).toBe(x);
            const box = rect(at.x, at.y, NODE_WIDTH, height);
            expect(clearOfAll(box, obstacles, margin), `${label} clear`).toBe(
              true,
            );
            const column = { x, height };
            if (index === 0) {
              expect(
                nearerClearExists(
                  tops[0] ?? 0,
                  at.y,
                  column,
                  obstacles,
                  margin,
                ),
                `${label} nearest`,
              ).toBe(false);
            } else {
              const bound = Math.max(tops[index] ?? 0, previousBottom + margin);
              expect(at.y, `${label} bound`).toBeGreaterThanOrEqual(bound);
              expect(
                clearYBetween(bound, at.y, column, obstacles, margin),
                `${label} lower`,
              ).toBe(false);
            }
            previousBottom = at.y + height;
            obstacles.push(box);
          });
        }
      }
    },
  );
});
