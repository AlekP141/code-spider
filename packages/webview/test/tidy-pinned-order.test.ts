import { describe, expect, it } from "vitest";
import { rowGap } from "../src/settings/column-gap.js";
import { walkOrder } from "../src/graph/call-order.js";
import { layoutGraph } from "../src/graph/layout.js";
import { isClear } from "../src/graph/placement.js";
import { graphFromSlice, pinNodes } from "../src/view/graph-state.js";
import type { GraphState, Point } from "../src/view/types.js";
import { calledSlice, id, PROJECT, tweakNode } from "./support/graph-states.js";
import { rectOf } from "./support/geometry.js";
import { outOfOrder } from "./support/order-graphs.js";
import {
  CALLED,
  laidOutCalls,
  pinNear,
  tidyLaidOut,
} from "./support/pinned-column.js";
import { mulberry32, randomInt, shuffled } from "./support/random.js";
import { HEIGHT, MARGIN } from "./support/refresh-order.js";

const GAP = 192;
const MIN_DISPLACED = 200;

describe("Tidy next to a pinned box keeps the unpinned boxes in code order", () => {
  it("moves the boxes of a column down together when a box pinned above a slot is in the way", async () => {
    const graph = await laidOutCalls(CALLED, GAP);
    const slot2 = graph.positions[id("c2")] ?? { x: 0, y: 0 };
    const pinned = pinNear(graph, "c0", "c2", -70);
    const tidied = await tidyLaidOut(pinned, graph.positions, GAP);

    const top = (name: string) => tidied.positions[id(name)];
    const x = slot2.x;
    expect(top("c0")).toEqual({ x, y: slot2.y - 70 });
    expect(top("c1")).toEqual({ x, y: slot2.y - 70 - MARGIN - HEIGHT });
    expect(top("c2")).toEqual({ x, y: slot2.y - 70 + HEIGHT + MARGIN });
    expect(top("c3")).toEqual({ x, y: slot2.y - 70 + 2 * (HEIGHT + MARGIN) });
    expect(top("c4")).toEqual({ x, y: slot2.y - 70 + 3 * (HEIGHT + MARGIN) });
  });
});

describe("Tidy on random columns with pinned boxes", () => {
  it("keeps every column's unpinned boxes in walk order, clear, with pinned boxes and x untouched", async () => {
    let displaced = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const next = mulberry32(seed);
      const names = Array.from(
        { length: randomInt(next, 3, 8) },
        (_, index) => `c${index}`,
      );
      let slice = calledSlice("f", names);
      for (const name of names) {
        slice = tweakNode(slice, name, { lineCount: randomInt(next, 1, 30) });
      }
      const base = graphFromSlice(slice, PROJECT);
      for (const gap of [32, 192, 480]) {
        const laid = await layoutGraph(base, gap);
        const column = laid[id(names[0] ?? "")] ?? { x: 0, y: 0 };
        let pinned: GraphState = { ...base, positions: laid, columnGap: gap };
        const count = randomInt(next, 1, 2);
        for (const name of shuffled(next, names).slice(0, count)) {
          const where = {
            x: column.x + randomInt(next, -150, 150),
            y: column.y + randomInt(next, -300, 1200),
          };
          pinned = pinNodes(pinned, { [id(name)]: where });
        }
        const tidied = await tidyLaidOut(pinned, laid, gap);
        const where = `seed ${seed} gap ${gap}`;

        const free = Object.keys(base.nodes).filter(
          (nodeId) => !pinned.pinned.includes(nodeId),
        );
        const unpinned: Record<string, Point> = {};
        for (const nodeId of free) {
          const at = tidied.positions[nodeId] as Point;
          expect(at.x, `${where} ${nodeId} x`).toBe(laid[nodeId]?.x);
          unpinned[nodeId] = at;
          if (at.y !== laid[nodeId]?.y) displaced += 1;
        }
        for (const nodeId of pinned.pinned) {
          expect(tidied.positions[nodeId], `${where} pinned`).toEqual(
            pinned.positions[nodeId],
          );
        }
        expect(outOfOrder(unpinned, walkOrder(base)), where).toBe(0);

        const ids = Object.keys(base.nodes);
        ids.forEach((nodeId, index) => {
          for (const other of ids.slice(index + 1)) {
            const both = [nodeId, other].every((one) =>
              pinned.pinned.includes(one),
            );
            if (both) continue;
            expect(
              isClear(
                rectOf(tidied, nodeId),
                rectOf(tidied, other),
                rowGap(gap),
              ),
              `${where} ${nodeId} vs ${other}`,
            ).toBe(true);
          }
        });
      }
    }
    expect(displaced).toBeGreaterThanOrEqual(MIN_DISPLACED);
  });
});
