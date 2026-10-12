import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppState,
} from "../../src/app/app-state.js";
import { NODE_WIDTH } from "../../src/graph/constants.js";
import { answerOf, id, PROJECT, sliceOf } from "../support/graph-states.js";

const VIEW_GAP = 192;
const OWN_GAP = 96;

function showing(focus: string): AppState {
  const pending = reduceApp(createAppState(undefined), {
    type: "slice",
    slice: sliceOf(focus, [], ["b"]),
    project: PROJECT,
    mode: { kind: "centre", sourceVersion: 0 },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions: {
      [id(focus)]: { x: 0, y: 0 },
      [id("b")]: { x: NODE_WIDTH + VIEW_GAP, y: 0 },
    },
  });
}

function refreshWithNewConsumer(state: AppState): AppState {
  const current = state.view.current;
  if (!current) throw new Error("no graph");
  const started = reduceApp(state, { type: "refreshStarted" });
  return reduceApp(started, answerOf(current, sliceOf("a", [], ["b", "c"])));
}

function withGraphGap(state: AppState, columnGap: number | undefined) {
  const current = state.view.current;
  if (!current) throw new Error("no graph");
  const { columnGap: _dropped, ...rest } = current;
  const graph = columnGap === undefined ? rest : { ...rest, columnGap };
  return { ...state, view: { ...state.view, current: graph } };
}

describe("an applied refreshed answer and the view", () => {
  it("leaves the history as it was", () => {
    const withHistory = reduceApp(
      reduceApp(showing("z"), {
        type: "slice",
        slice: sliceOf("a", [], ["b"]),
        project: PROJECT,
        mode: { kind: "centre", sourceVersion: 0 },
      }),
      {
        type: "centreLaidOut",
        id: 2,
        positions: { [id("a")]: { x: 0, y: 0 } },
      },
    );
    expect(withHistory.view.history).toHaveLength(1);
    const next = refreshWithNewConsumer(withHistory);
    expect(next.refreshing).toBe(false);
    expect(next.view.current?.nodes[id("c")]).toBeDefined();
    expect(next.view.history).toBe(withHistory.view.history);
  });

  it("places new boxes with the graph's own column gap", () => {
    const next = refreshWithNewConsumer(withGraphGap(showing("a"), OWN_GAP));
    expect(next.view.columnGap).toBe(VIEW_GAP);
    expect(next.view.current?.positions[id("c")]?.x).toBe(NODE_WIDTH + OWN_GAP);
  });

  it("falls back to the view's column gap when the graph has none", () => {
    const next = refreshWithNewConsumer(withGraphGap(showing("a"), undefined));
    expect(next.view.current?.positions[id("c")]?.x).toBe(
      NODE_WIDTH + VIEW_GAP,
    );
  });
});
