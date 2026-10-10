import { describe, expect, it } from "vitest";
import { applyLive, recordLive } from "../src/graph/live-positions.js";
import { toFlow } from "../src/graph/to-flow.js";
import { graphOf, id } from "./support/graph-states.js";

const { nodes } = toFlow(graphOf("a", ["b"]));

describe("recordLive", () => {
  it("starts from nothing and accumulates moves within one generation", () => {
    const first = recordLive(undefined, 3, [[id("a"), { x: 1, y: 2 }]]);
    const second = recordLive(first, 3, [[id("b"), { x: 3, y: 4 }]]);
    expect(second).toEqual({
      generation: 3,
      positions: { [id("a")]: { x: 1, y: 2 }, [id("b")]: { x: 3, y: 4 } },
    });
  });

  it("drops what was recorded under another generation", () => {
    const old = recordLive(undefined, 3, [[id("a"), { x: 1, y: 2 }]]);
    const next = recordLive(old, 4, [[id("b"), { x: 3, y: 4 }]]);
    expect(next).toEqual({
      generation: 4,
      positions: { [id("b")]: { x: 3, y: 4 } },
    });
  });
});

describe("applyLive", () => {
  const live = { generation: 3, positions: { [id("a")]: { x: 9, y: 9 } } };

  it("moves the dragged nodes of the current generation", () => {
    const moved = applyLive(nodes, live, 3);
    expect(moved.find((node) => node.id === id("a"))?.position).toEqual({
      x: 9,
      y: 9,
    });
    expect(moved.find((node) => node.id === id("b"))).toBe(
      nodes.find((node) => node.id === id("b")),
    );
  });

  it("ignores positions recorded under another generation", () => {
    expect(applyLive(nodes, live, 4)).toBe(nodes);
  });

  it("returns the nodes as they are without live positions", () => {
    expect(applyLive(nodes, undefined, 3)).toBe(nodes);
  });
});
