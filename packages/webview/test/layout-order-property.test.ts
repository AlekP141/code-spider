import { describe, expect, it } from "vitest";
import { walkOrder } from "../src/graph/call-order.js";
import { layoutGraph } from "../src/graph/layout.js";
import {
  columnsOf,
  crowded,
  elkAlone,
  outOfOrder,
  randomGraph,
} from "./support/order-graphs.js";

const SEEDS = 100;
const GAPS = [32, 192, 480];
const ELK_GAP = 192;
const MIN_WIDE_COLUMNS = 170;
const MIN_ELK_WRONG_COLUMNS = 5;

describe("layoutGraph on random graphs", () => {
  it("puts every column in walk order, clear by the row gap, over 100 seeds", async () => {
    let wideColumns = 0;
    let elkWrongColumns = 0;
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const graph = randomGraph(seed);
      const order = walkOrder(graph);
      for (const gap of GAPS) {
        const positions = await layoutGraph(graph, gap);
        const where = `seed ${seed} gap ${gap}`;
        expect(Object.keys(positions).sort(), where).toEqual(
          Object.keys(graph.nodes).sort(),
        );
        expect(outOfOrder(positions, order), where).toBe(0);
        expect(crowded(graph, positions, gap), where).toEqual([]);
        wideColumns += columnsOf(positions).filter(
          (column) => column.length >= 3,
        ).length;
      }
      elkWrongColumns += outOfOrder(await elkAlone(graph, ELK_GAP), order);
    }
    expect(wideColumns).toBeGreaterThanOrEqual(MIN_WIDE_COLUMNS);
    expect(elkWrongColumns).toBeGreaterThanOrEqual(MIN_ELK_WRONG_COLUMNS);
  });
});
