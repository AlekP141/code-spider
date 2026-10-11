import { describe, expect, it } from "vitest";
import {
  edgeClickMessage,
  expandMessage,
  nodeClickMessage,
  refreshMessage,
} from "../src/graph/jump.js";
import { mergeExpansion } from "../src/view/graph-state.js";
import { graphOf, id, PROJECT, sliceOf } from "./support/graph-states.js";
import { makeNode } from "./support/slices.js";

const project = "/repo/tsconfig.json";

describe("nodeClickMessage", () => {
  it("asks the extension to open a repo function at its declaration", () => {
    const node = makeNode({ id: "src/a.ts#f", file: "src/a.ts" });
    expect(nodeClickMessage(node, project)).toEqual({
      type: "openInEditor",
      project,
      nodeId: "src/a.ts#f",
    });
  });

  it("opens module and component nodes too", () => {
    expect(
      nodeClickMessage(
        makeNode({ id: "src/m.tsx#<module>", kind: "module" }),
        project,
      ),
    ).toEqual({ type: "openInEditor", project, nodeId: "src/m.tsx#<module>" });
    expect(
      nodeClickMessage(
        makeNode({ id: "src/c.tsx#C", kind: "component" }),
        project,
      ),
    ).toMatchObject({ type: "openInEditor" });
  });

  it("does nothing for external and unknown nodes, which have no file", () => {
    const external = makeNode({
      id: "external:lib#x",
      kind: "external",
      file: "",
    });
    const unknown = makeNode({
      id: "unknown:a#f#x()",
      kind: "unknown",
      file: "",
    });
    expect(nodeClickMessage(external, project)).toBeUndefined();
    expect(nodeClickMessage(unknown, project)).toBeUndefined();
  });
});

describe("edgeClickMessage", () => {
  it("asks the extension to open the call site of the edge", () => {
    expect(edgeClickMessage("a#f->a#g", project)).toEqual({
      type: "openCallSite",
      project,
      edgeId: "a#f->a#g",
    });
  });
});

describe("expandMessage", () => {
  it("carries the node, the project and the generation", () => {
    expect(expandMessage("src/a.ts#f", project, 4)).toEqual({
      type: "expand",
      project,
      nodeId: "src/a.ts#f",
      generation: 4,
    });
  });
});

describe("refreshMessage", () => {
  it("lists the expanded keys but the centre, in recorded order", () => {
    const base = graphOf("a", ["b", "c"]);
    const withC = mergeExpansion(base, id("c"), sliceOf("c", ["d"])).graph;
    const graph = mergeExpansion(withC, id("b"), sliceOf("b", ["e"])).graph;
    expect(refreshMessage(graph)).toEqual({
      type: "refresh",
      project: PROJECT,
      generation: graph.generation,
      focusId: id("a"),
      expanded: [id("c"), id("b")],
    });
  });

  it("sends an empty list when nothing is expanded", () => {
    expect(refreshMessage(graphOf("a", ["b"]))).toMatchObject({
      focusId: id("a"),
      expanded: [],
    });
  });
});
