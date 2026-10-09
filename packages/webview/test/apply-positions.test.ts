import { describe, expect, it } from "vitest";
import { applyPositions } from "../src/graph/layout.js";
import { toFlow } from "../src/graph/to-flow.js";
import { makeNode, makeSlice } from "./support/slices.js";

describe("applyPositions", () => {
  const { nodes } = toFlow(
    makeSlice("a#a", [makeNode({ id: "a#a" }), makeNode({ id: "a#b" })], []),
  );

  it("moves each node to its laid-out position without changing anything else", () => {
    const placed = applyPositions(
      nodes,
      new Map([
        ["a#a", { x: 12, y: 34 }],
        ["a#b", { x: 400, y: 5 }],
      ]),
    );
    expect(placed.map((node) => node.position)).toEqual([
      { x: 12, y: 34 },
      { x: 400, y: 5 },
    ]);
    expect(placed[0]?.data).toBe(nodes[0]?.data);
    expect(placed[0]?.height).toBe(nodes[0]?.height);
  });

  it("leaves a node with no position where it was and does not mutate the input", () => {
    const placed = applyPositions(nodes, new Map());
    expect(placed.map((node) => node.position)).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(placed).not.toBe(nodes);
  });
});
