import { describe, expect, it } from "vitest";
import {
  classifyNodeClick,
  ignoresDoubleClick,
} from "../../src/graph/click-rules.js";
import { makeNode } from "../support/slices.js";

const project = "/repo/tsconfig.json";
const box = makeNode({ id: "src/a.ts#f" });

describe("classifyNodeClick", () => {
  it("makes a shift click on a function or component a path click", () => {
    for (const kind of ["function", "component"] as const) {
      const node = { ...box, kind };
      expect(classifyNodeClick(true, node, project)).toEqual({
        kind: "path",
        message: { type: "pathClick", project, nodeId: node.id },
      });
    }
  });

  it("makes a shift click on a module, external or unknown box a path click with no message", () => {
    for (const kind of ["module", "external", "unknown"] as const) {
      expect(classifyNodeClick(true, { ...box, kind }, project)).toEqual({
        kind: "path",
        message: undefined,
      });
    }
  });

  it("leaves a click without shift as a normal click", () => {
    for (const kind of ["function", "module", "external"] as const) {
      expect(classifyNodeClick(false, { ...box, kind }, project)).toEqual({
        kind: "normal",
      });
    }
  });

  it("a double-click with Shift held neither expands nor collapses", () => {
    expect(ignoresDoubleClick(true)).toBe(true);
    expect(ignoresDoubleClick(false)).toBe(false);
  });
});
