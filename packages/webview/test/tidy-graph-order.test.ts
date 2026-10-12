import { describe, expect, it } from "vitest";
import { rowGap } from "../src/settings/column-gap.js";
import { walkOrder } from "../src/graph/call-order.js";
import { NODE_WIDTH } from "../src/graph/constants.js";
import { nodeHeight } from "../src/graph/node-size.js";
import { isClear, type Rect } from "../src/graph/placement.js";
import { tidyGraph } from "../src/graph/tidy-graph.js";
import { graphFromSlice, pinNodes } from "../src/view/graph-state.js";
import { PROJECT } from "./support/graph-states.js";
import {
  columnsOf,
  crowded,
  outOfOrder,
  randomGraph,
} from "./support/order-graphs.js";
import { readGolden } from "./support/slices.js";

const signup = () =>
  graphFromSlice(readGolden("basic-handleSignup.json"), PROJECT);
const handle = (name: string) => `src/signup.ts#${name}`;
const GAP = 192;

describe("tidyGraph in code order", () => {
  it("puts the handleSignup called column in code order when nothing is pinned", async () => {
    const outcome = await tidyGraph(
      () => signup(),
      () => GAP,
    );
    const positions = outcome?.positions ?? {};
    const called = columnsOf(positions).find((column) =>
      column.includes(handle("validateUser")),
    );
    expect(called).toEqual([
      handle("validateUser"),
      handle("createUser"),
      handle("sendWelcome"),
    ]);
  });

  it("keeps a pinned box where it is, and the unpinned called boxes in code order and clear of it", async () => {
    const away = { x: 5000, y: 0 };
    const graph = pinNodes(signup(), { [handle("createUser")]: away });
    const outcome = await tidyGraph(
      () => graph,
      () => GAP,
    );
    const positions = outcome?.positions ?? {};
    expect(positions[handle("createUser")]).toEqual(away);

    const top = (name: string) => positions[handle(name)]?.y ?? Number.NaN;
    expect(top("validateUser")).toBeLessThan(top("sendWelcome"));

    const rects: Rect[] = Object.values(graph.nodes).map((node) => ({
      ...(positions[node.id] ?? { x: 0, y: 0 }),
      width: NODE_WIDTH,
      height: nodeHeight(node),
    }));
    rects.forEach((rect, index) => {
      for (const other of rects.slice(index + 1)) {
        expect(isClear(rect, other, rowGap(GAP))).toBe(true);
      }
    });
  });

  it("re-sorts every column of a graph ELK alone leaves out of order", async () => {
    const graph = randomGraph(5);
    const outcome = await tidyGraph(
      () => graph,
      () => GAP,
    );
    const positions = outcome?.positions ?? {};
    expect(outOfOrder(positions, walkOrder(graph))).toBe(0);
    expect(crowded(graph, positions, GAP)).toEqual([]);
  });
});
