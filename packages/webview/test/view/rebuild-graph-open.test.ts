import { describe, expect, it } from "vitest";
import { mergeExpansion } from "../../src/view/graph-state.js";
import { rebuildGraph } from "../../src/view/refresh.js";
import type { GraphState } from "../../src/view/types.js";
import {
  answerOf,
  graphOf,
  id,
  sliceOf,
  tweakNode,
  withPositions,
} from "../support/graph-states.js";

const GAP = 192;
const PITCH = 320 + GAP;

function chain(open: string[] | undefined): GraphState {
  const base = graphOf("a", [], ["b"]);
  const full = mergeExpansion(base, id("b"), sliceOf("b", [], ["c"])).graph;
  const positioned = withPositions(full, {
    [id("a")]: { x: 0, y: 0 },
    [id("b")]: { x: PITCH, y: 0 },
    [id("c")]: { x: 2 * PITCH, y: 0 },
  });
  const { open: _default, ...rest } = positioned;
  return open === undefined ? rest : { ...rest, open: open.map(id) };
}

function refreshed(current: GraphState) {
  const answer = answerOf(current, sliceOf("a", [], ["b"]), [
    { nodeId: id("b"), slice: sliceOf("b", [], ["c"]) },
  ]);
  return rebuildGraph(current, answer, GAP).graph;
}

describe("rebuildGraph and open", () => {
  it("keeps the open state of the boxes that survive", () => {
    const graph = refreshed(chain(["b", "c"]));
    expect(graph.open).toEqual([id("b"), id("c")]);
  });

  it("keeps a closed centre closed", () => {
    const graph = refreshed(chain(["b"]));
    expect(graph.open).toEqual([id("b")]);
  });

  it("keeps an open centre open", () => {
    const graph = refreshed(chain(["a"]));
    expect(graph.open).toEqual([id("a")]);
  });

  it("drops a box that left the graph from open", () => {
    const current = chain(["a", "b", "c"]);
    const answer = answerOf(current, sliceOf("a", [], ["b"]));
    const graph = rebuildGraph(current, answer, GAP).graph;
    expect(Object.keys(graph.nodes)).not.toContain(id("c"));
    expect(graph.open).toEqual([id("a"), id("b")]);

    const noCode = tweakNode(sliceOf("a", [], ["b"]), "b", { codePreview: "" });
    const chip = rebuildGraph(current, answerOf(current, noCode), GAP).graph;
    expect(chip.open).toEqual([id("a")]);
  });

  it("closes a box that is new to the graph", () => {
    const current = chain(["a", "b"]);
    const answer = answerOf(current, sliceOf("a", [], ["b", "n"]), [
      { nodeId: id("b"), slice: sliceOf("b", [], ["c"]) },
    ]);
    const graph = rebuildGraph(current, answer, GAP).graph;
    expect(Object.keys(graph.nodes)).toContain(id("n"));
    expect(graph.open).toEqual([id("a"), id("b")]);
  });

  it("rebuilds a graph with no open as an empty list", () => {
    const graph = refreshed(chain(undefined));
    expect(graph.open).toEqual([]);
  });
});
