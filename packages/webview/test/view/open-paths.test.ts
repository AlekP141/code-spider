import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { tidyGraph } from "../../src/graph/layout/tidy-graph.js";
import { isClear } from "../../src/graph/layout/placement.js";
import { rowGap } from "../../src/settings/column-gap.js";
import { applyExpansion } from "../../src/view/expansion.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import { closeNode, openNode } from "../../src/view/open-close.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { GraphState } from "../../src/view/types.js";
import { CLOSED_HEIGHT, OPEN_HEIGHT, rectOf } from "../support/geometry.js";
import {
  answerOf,
  calledSlice,
  id,
  PROJECT,
  withPositions,
} from "../support/graph-states.js";
import { crowded } from "../support/order-graphs.js";

const GAP = 192;
const MARGIN = rowGap(GAP);
const STEP = CLOSED_HEIGHT + MARGIN;
const PITCH = NODE_WIDTH + GAP;
const NAMES = ["c0", "c1", "c2"];
const slice = () => calledSlice("f", NAMES);

function closedColumn(): GraphState {
  return withPositions(graphFromSlice(slice(), PROJECT), {
    [id("f")]: { x: 2 * PITCH, y: 0 },
    [id("c0")]: { x: PITCH, y: 0 },
    [id("c1")]: { x: PITCH, y: STEP },
    [id("c2")]: { x: PITCH, y: 2 * STEP },
  });
}

const refreshed = (current: GraphState) =>
  rebuildGraph(current, answerOf(current, slice()), GAP);

describe("open and close, then Refresh with unchanged code", () => {
  it("moves nothing, keeps the open state and adds nothing after an open", () => {
    const current = openNode(closedColumn(), id("c0"), GAP);
    const { graph, added } = refreshed(current);
    expect(graph.positions).toEqual(current.positions);
    expect(graph.open).toEqual(current.open);
    expect(Object.keys(graph.nodes).sort()).toEqual(
      Object.keys(current.nodes).sort(),
    );
    expect(added).toEqual([]);
  });

  it("moves nothing after an open and a close", () => {
    const current = closeNode(
      openNode(closedColumn(), id("c0"), GAP),
      id("c0"),
    );
    const { graph, added } = refreshed(current);
    expect(graph.positions).toEqual(current.positions);
    expect(graph.open).toEqual(current.open);
    expect(added).toEqual([]);
  });
});

describe("open, then expand with the walk", () => {
  it("centres the new called boxes on the open height and overlaps nothing", () => {
    const current = openNode(closedColumn(), id("c0"), GAP);
    const { graph, added } = applyExpansion(
      current,
      id("c0"),
      calledSlice("c0", ["d0", "d1"]),
      GAP,
    );
    expect(added.sort()).toEqual([id("d0"), id("d1")]);
    const d0 = rectOf(graph, id("d0"));
    const d1 = rectOf(graph, id("d1"));
    expect(d1.y - d0.y).toBe(STEP);
    expect((d0.y + d1.y + d1.height) / 2).toBeCloseTo(OPEN_HEIGHT / 2, 6);
    const ids = Object.keys(graph.positions);
    for (const [index, first] of ids.entries()) {
      for (const second of ids.slice(index + 1)) {
        const clear = isClear(rectOf(graph, first), rectOf(graph, second), 0);
        expect(clear, `${first} and ${second}`).toBe(true);
      }
    }
  });
});

describe("open, then Tidy", () => {
  const tidied = async (graph: GraphState): Promise<GraphState> => {
    const outcome = await tidyGraph(
      () => graph,
      () => GAP,
    );
    return withPositions(graph, outcome?.positions ?? {});
  };

  it("clears every column by the row gap at open heights, and matches a never opened graph once closed", async () => {
    const never = closedColumn();
    const opened = openNode(never, id("c0"), GAP);
    const tidyOpen = await tidied(opened);
    expect(Object.keys(tidyOpen.positions)).toHaveLength(4);
    expect(crowded(tidyOpen, tidyOpen.positions, GAP)).toEqual([]);

    const tidyClosed = await tidied(closeNode(tidyOpen, id("c0")));
    const tidyNever = await tidied(never);
    expect(tidyClosed.positions).toEqual(tidyNever.positions);
  });
});
