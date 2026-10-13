import { describe, expect, it } from "vitest";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { rowGap } from "../../src/settings/column-gap.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import { closeNode, openNode } from "../../src/view/open-close.js";
import type { GraphState, Point } from "../../src/view/types.js";
import { CLOSED_HEIGHT, OPEN_HEIGHT } from "../support/geometry.js";
import { calledSlice, id, PROJECT } from "../support/graph-states.js";
import { makeNode } from "../support/slices.js";

const GAP = 192;
const MARGIN = rowGap(GAP);
const STEP = CLOSED_HEIGHT + MARGIN;
const PITCH = NODE_WIDTH + GAP;
const NAMES = ["c0", "c1", "c2", "c3"];

function column(
  names: string[],
  change: (graph: GraphState) => GraphState = (graph) => graph,
): GraphState {
  const graph = graphFromSlice(calledSlice("f", names), PROJECT);
  const positions: Record<string, Point> = { [id("f")]: { x: -PITCH, y: 0 } };
  names.forEach((name, index) => {
    positions[id(name)] = { x: 0, y: index * STEP };
  });
  return change({ ...graph, open: [], positions });
}

const top = (graph: GraphState, name: string) =>
  graph.positions[id(name)]?.y ?? Number.NaN;

describe("openNode", () => {
  it("adds the id to open and adds exactly one to the revision", () => {
    const before = column(NAMES);
    const opened = openNode(before, id("c0"), GAP);
    expect(opened.open).toEqual([id("c0")]);
    expect(opened.revision).toBe(before.revision + 1);
    const again = openNode({ ...before, open: [id("c3")] }, id("c0"), GAP);
    expect(again.open).toEqual([id("c3"), id("c0")]);
  });

  it("returns the very same graph for an open box, a missing box or a chip", () => {
    const open = column(NAMES, (graph) => ({ ...graph, open: [id("c0")] }));
    expect(openNode(open, id("c0"), GAP)).toBe(open);
    expect(openNode(open, id("zz"), GAP)).toBe(open);
    const chip = column(NAMES, (graph) => ({
      ...graph,
      nodes: {
        ...graph.nodes,
        [id("c1")]: makeNode({ id: id("c1"), codePreview: "" }),
      },
    }));
    expect(openNode(chip, id("c1"), GAP)).toBe(chip);
  });

  it("pushes the box directly below down until it clears the opened box by the row gap", () => {
    const opened = openNode(column(NAMES), id("c0"), GAP);
    expect(top(opened, "c1")).toBe(OPEN_HEIGHT + MARGIN);
  });

  it("does not move a box that is already clear, above, beside or in another column", () => {
    const before = column(["c0", "c1", "c2", "c3", "c4"], (graph) => ({
      ...graph,
      positions: {
        ...graph.positions,
        [id("c0")]: { x: 0, y: STEP },
        [id("c1")]: { x: 0, y: 0 },
        [id("c2")]: { x: PITCH, y: STEP },
        [id("c3")]: { x: 2 * PITCH, y: STEP + 20 },
        [id("c4")]: { x: 0, y: STEP + OPEN_HEIGHT + MARGIN + 50 },
      },
    }));
    const opened = openNode(before, id("c0"), GAP);
    expect(opened.positions).toEqual(before.positions);
  });

  it("does not move the opened box", () => {
    const before = column(NAMES);
    const opened = openNode(before, id("c0"), GAP);
    expect(opened.positions[id("c0")]).toEqual(before.positions[id("c0")]);
  });

  it("cascades down a column of four boxes, keeping their order and the row gap", () => {
    const opened = openNode(column(NAMES), id("c0"), GAP);
    const c1 = OPEN_HEIGHT + MARGIN;
    expect(top(opened, "c0")).toBe(0);
    expect(top(opened, "c1")).toBe(c1);
    expect(top(opened, "c2")).toBe(c1 + STEP);
    expect(top(opened, "c3")).toBe(c1 + 2 * STEP);
  });

  it("leaves a pinned box below where it is and moves an unpinned box below it", () => {
    const before = column(NAMES, (graph) => ({
      ...graph,
      open: [id("c1")],
      pinned: [id("c1")],
    }));
    const opened = openNode(before, id("c0"), GAP);
    expect(opened.positions[id("c1")]).toEqual(before.positions[id("c1")]);
    expect(top(opened, "c2")).toBe(STEP + OPEN_HEIGHT + MARGIN);
    expect(top(opened, "c3")).toBe(top(opened, "c2") + STEP);
  });

  it("uses a row gap that follows the column gap", () => {
    for (const gap of [32, 480]) {
      const opened = openNode(column(NAMES), id("c0"), gap);
      expect(top(opened, "c1"), `gap ${gap}`).toBe(OPEN_HEIGHT + rowGap(gap));
    }
  });

  it("opens a box without a position and moves nothing", () => {
    const before = column(NAMES, (graph) => {
      const { [id("c0")]: _gone, ...rest } = graph.positions;
      return { ...graph, positions: rest };
    });
    const opened = openNode(before, id("c0"), GAP);
    expect(opened.open).toEqual([id("c0")]);
    expect(opened.positions).toEqual(before.positions);
    expect(opened.revision).toBe(before.revision + 1);
  });

  it("does not pin a pushed box or change the input graph", () => {
    const before = column(NAMES);
    const snapshot = structuredClone(before);
    const opened = openNode(before, id("c0"), GAP);
    expect(top(opened, "c1")).not.toBe(top(before, "c1"));
    expect(opened.pinned).toEqual([]);
    expect(before).toEqual(snapshot);
  });
});

describe("closeNode", () => {
  const opened = () => openNode(column(NAMES), id("c0"), GAP);

  it("removes the id, adds one to the revision and moves nothing", () => {
    const before = opened();
    const closed = closeNode(before, id("c0"));
    expect(closed.open).toEqual([]);
    expect(closed.revision).toBe(before.revision + 1);
    expect(closed.positions).toEqual(before.positions);
  });

  it("returns the very same graph for a closed box, a missing box or when open is absent", () => {
    const before = opened();
    expect(closeNode(before, id("c1"))).toBe(before);
    expect(closeNode(before, id("zz"))).toBe(before);
    const { open: _open, ...absent } = before;
    expect(closeNode(absent, id("c0"))).toBe(absent);
  });

  it("moves nothing further when the box is opened again after a close", () => {
    const first = opened();
    const again = openNode(closeNode(first, id("c0")), id("c0"), GAP);
    expect(again.positions).toEqual(first.positions);
  });
});
