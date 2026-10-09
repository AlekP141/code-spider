import { describe, expect, it } from "vitest";
import { edgeClickMessage, nodeClickMessage } from "../src/graph/jump.js";
import { makeNode } from "./support/slices.js";

describe("nodeClickMessage", () => {
  it("asks the extension to open a repo function at its declaration", () => {
    const node = makeNode({ id: "src/a.ts#f", file: "src/a.ts" });
    expect(nodeClickMessage(node)).toEqual({
      type: "openInEditor",
      nodeId: "src/a.ts#f",
    });
  });

  it("opens module and component nodes too", () => {
    expect(
      nodeClickMessage(makeNode({ id: "src/m.tsx#<module>", kind: "module" })),
    ).toEqual({ type: "openInEditor", nodeId: "src/m.tsx#<module>" });
    expect(
      nodeClickMessage(makeNode({ id: "src/c.tsx#C", kind: "component" })),
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
    expect(nodeClickMessage(external)).toBeUndefined();
    expect(nodeClickMessage(unknown)).toBeUndefined();
  });
});

describe("edgeClickMessage", () => {
  it("asks the extension to open the call site of the edge", () => {
    expect(edgeClickMessage("a#f->a#g")).toEqual({
      type: "openCallSite",
      edgeId: "a#f->a#g",
    });
  });
});
