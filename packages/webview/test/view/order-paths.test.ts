import type { GraphSlice } from "@code-spider/core/types";
import { describe, expect, it } from "vitest";
import { layoutGraph } from "../../src/graph/layout/layout.js";
import { tidyGraph } from "../../src/graph/layout/tidy-graph.js";
import { applyExpansion } from "../../src/view/expansion.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import type { GraphState } from "../../src/view/types.js";
import { calledSlice, id, PROJECT } from "../support/graph-states.js";
import {
  CALLED,
  laidOutCalls,
  OFFSETS,
  pinNear,
  tidyLaidOut,
} from "../support/pinned-column.js";
import {
  CENTRE,
  MAIN,
  mainSlice,
  SHAPES,
  signupSlice,
} from "../support/main-shape.js";
import { refresh } from "../support/refresh-order.js";
import { makeEdge, makeNode, site } from "../support/slices.js";

const GAP = 192;
const HEIGHTS = [3, 25];

async function laidOut(slice: GraphSlice, gap: number): Promise<GraphState> {
  const graph = graphFromSlice(slice, PROJECT);
  const positions = await layoutGraph(graph, gap);
  return { ...graph, positions, columnGap: gap };
}

function expectStill(
  current: GraphState,
  centre: GraphSlice,
  expansions: GraphSlice[],
  gap: number,
  label: string,
) {
  const first = refresh(current, centre, expansions, gap);
  expect(first.graph.positions, label).toEqual(current.positions);
  expect(first.added, label).toEqual([]);
  const second = refresh(first.graph, centre, expansions, gap);
  expect(second.graph.positions, `${label} second`).toEqual(
    current.positions,
  );
}

const named = (graph: GraphState, names: string[]) =>
  [...names].sort(
    (a, b) => (graph.positions[a]?.y ?? 0) - (graph.positions[b]?.y ?? 0),
  );

describe("refresh after the other layout paths, code unchanged", () => {
  it.each([32, 192, 480])(
    "moves nothing after the first layout of handleSignup at gap %i",
    async (gap) => {
      const current = await laidOut(signupSlice(), gap);
      expectStill(current, signupSlice(), [], gap, `gap ${gap}`);
    },
  );

  it("moves nothing after the caller main is expanded, for 32 shapes", async () => {
    const base = await laidOut(signupSlice(), GAP);
    for (const lineCount of HEIGHTS) {
      for (const { before, after } of SHAPES) {
        const slice = mainSlice(before, after, lineCount);
        const current = applyExpansion(base, MAIN, slice, GAP).graph;
        const label = `${before} before ${after} after ${lineCount} lines`;
        expectStill(current, signupSlice(), [slice], GAP, label);
      }
    }
  });

  it("moves nothing after Tidy of the expanded graph, for 32 shapes", async () => {
    const base = await laidOut(signupSlice(), GAP);
    for (const lineCount of HEIGHTS) {
      for (const { before, after } of SHAPES) {
        const slice = mainSlice(before, after, lineCount);
        const expanded = applyExpansion(base, MAIN, slice, GAP).graph;
        const outcome = await tidyGraph(
          () => expanded,
          () => GAP,
        );
        const positions = outcome?.positions ?? {};
        const current = { ...expanded, positions };
        const label = `tidy ${before} before ${after} after ${lineCount}`;
        expectStill(current, signupSlice(), [slice], GAP, label);
      }
    }
  });
});

describe("a centre with many called functions", () => {
  const calls = (count: number) =>
    Array.from({ length: count }, (_, index) => `c${index + 10}`);

  it.each([
    [8, 32],
    [12, 32],
    [8, 64],
    [12, 64],
  ])(
    "moves nothing with %i calls at gap %i, and reorders swapped calls",
    async (count, gap) => {
      const names = calls(count);
      const current = await laidOut(calledSlice("a", names), gap);
      expectStill(current, calledSlice("a", names), [], gap, `${count}`);

      const swapped = [names[1] ?? "", names[0] ?? "", ...names.slice(2)];
      const { graph } = refresh(current, calledSlice("a", swapped), [], gap);
      expect(named(graph, swapped.map(id))).toEqual(swapped.map(id));
    },
  );
});

describe("a centre dragged sideways", () => {
  function swappedSignup(): GraphSlice {
    const slice = signupSlice();
    const validate = "src/signup.ts#validateUser";
    const create = "src/signup.ts#createUser";
    const siteOf = (from: string) =>
      slice.edges.find((edge) => edge.from === from)?.callSite ?? site(1);
    return {
      ...slice,
      edges: slice.edges.map((edge) => {
        if (edge.from === validate && edge.to === CENTRE) {
          return { ...edge, callSite: siteOf(create) };
        }
        if (edge.from === create && edge.to === CENTRE) {
          return { ...edge, callSite: siteOf(validate) };
        }
        return edge;
      }),
    };
  }

  it.each([3, 30])(
    "still swaps two calls and puts a new call in their column when dragged by %i",
    async (dx) => {
      const base = await laidOut(signupSlice(), GAP);
      const at = base.positions[CENTRE] ?? { x: 0, y: 0 };
      const dragged = {
        ...base,
        positions: { ...base.positions, [CENTRE]: { x: at.x + dx, y: at.y } },
        pinned: [CENTRE],
      };
      const swapped = swappedSignup();
      const fresh = "src/signup.ts#audit";
      const slice = {
        ...swapped,
        nodes: [...swapped.nodes, makeNode({ id: fresh })],
        edges: [
          ...swapped.edges,
          makeEdge(fresh, CENTRE, { callSite: site(1) }),
        ],
      };
      const { graph } = refresh(dragged, slice, [], GAP);
      const validate = "src/signup.ts#validateUser";
      const create = "src/signup.ts#createUser";
      const column = base.positions[validate]?.x;
      expect(graph.positions[fresh]?.x).toBe(column);
      expect(named(graph, [fresh, validate, create])).toEqual([
        fresh,
        create,
        validate,
      ]);
      expect(graph.positions[CENTRE]).toEqual(dragged.positions[CENTRE]);
    },
  );
});

describe("refresh after Tidy next to a pinned box, code unchanged", () => {
  it("moves nothing for each of 5 boxes pinned at 6 offsets from each of 5 slots", async () => {
    const base = await laidOutCalls(CALLED, GAP);
    for (const name of CALLED) {
      for (const slot of CALLED) {
        for (const offset of OFFSETS) {
          const pinned = pinNear(base, name, slot, offset);
          const current = await tidyLaidOut(pinned, base.positions, GAP);
          const label = `${name} pinned ${offset} from ${slot}`;
          expectStill(current, calledSlice("f", CALLED), [], GAP, label);
        }
      }
    }
  });
});
