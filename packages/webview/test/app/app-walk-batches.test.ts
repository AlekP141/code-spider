import { describe, expect, it } from "vitest";
import {
  createAppState,
  reduceApp,
  type AppAction,
  type AppState,
} from "../../src/app/app-state.js";
import { id, PROJECT, sliceOf } from "../support/graph-states.js";

const positions = {
  [id("a")]: { x: 1000, y: 500 },
  [id("b")]: { x: 488, y: 1500 },
  [id("c")]: { x: 488, y: -900 },
};

function showing(): AppState {
  const pending = reduceApp(createAppState(undefined), {
    type: "slice",
    slice: sliceOf("a", ["b", "c"]),
    project: PROJECT,
    mode: { kind: "centre", sourceVersion: 0 },
  });
  return reduceApp(pending, {
    type: "centreLaidOut",
    id: pending.pending?.id ?? -1,
    positions,
  });
}

const answer = (parent: string, supplier: string): AppAction => ({
  type: "slice",
  slice: sliceOf(parent, [supplier], ["a"]),
  project: PROJECT,
  mode: { kind: "expansion", nodeId: id(parent), generation: 1 },
});

describe("expansion answers arriving while a fade is running", () => {
  it("keep both batches entering and reveal a box spanning both", () => {
    const first = reduceApp(showing(), answer("b", "d"));
    const second = reduceApp(first, answer("c", "e"));
    expect([...second.entering.ids].sort()).toEqual([id("d"), id("e")]);
    expect(second.entering.token).toBeGreaterThan(first.entering.token);
    expect(second.reveal?.token).toBe(second.entering.token);

    const firstRect = first.reveal!.rect;
    const rect = second.reveal!.rect;
    expect(rect.x).toBeLessThanOrEqual(firstRect.x);
    expect(rect.y).toBeLessThanOrEqual(firstRect.y);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(
      firstRect.x + firstRect.width,
    );
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(
      firstRect.y + firstRect.height,
    );
    const at = second.view.current!.positions[id("e")]!;
    expect(rect.y).toBeLessThanOrEqual(at.y);
    expect(rect.y + rect.height).toBeGreaterThan(at.y);
  });

  it("hold only their own ids once the earlier fade has expired", () => {
    const first = reduceApp(showing(), answer("b", "d"));
    const expired = reduceApp(first, {
      type: "enteringExpired",
      token: first.entering.token,
    });
    const second = reduceApp(expired, answer("c", "e"));
    expect(second.entering.ids).toEqual([id("e")]);
  });

  it("forget earlier ids that left the graph", () => {
    const first = reduceApp(showing(), answer("b", "d"));
    const collapsed = reduceApp(first, { type: "collapsed", nodeId: id("b") });
    const second = reduceApp(collapsed, answer("c", "e"));
    expect(second.entering.ids).toEqual([id("e")]);
  });
});
