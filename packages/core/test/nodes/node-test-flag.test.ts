import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../../src/analyze.js";
import { toFocusTarget } from "../../src/focus/focus.js";
import {
  buildGraphNode,
  buildModuleNode,
} from "../../src/nodes/node-builder.js";
import type { NodeKind } from "../../src/types.js";
import { MEMORY_ROOT, memoryProject } from "../helpers.js";

const project = memoryProject({
  "src/lib.ts": "export function target(): number { return 1 }\n",
  "src/lib.test.ts":
    'import { target } from "./lib.js"\n' +
    "export function check(): number { return helper() }\n" +
    "export function helper(): number { return target() }\n",
  "tests/in-folder.ts": "export function inFolder(): number { return 1 }\n",
  "src/app.ts":
    'import { target } from "./lib.js"\n' +
    "export function run(): number { return target() }\n",
});
const ctx = { repoRoot: MEMORY_ROOT };

function functionNode(
  rel: string,
  name: string,
  kind: NodeKind = "function",
) {
  const file = project.getSourceFileOrThrow(`${MEMORY_ROOT}/${rel}`);
  return buildGraphNode(
    toFocusTarget(file.getFunctionOrThrow(name), file),
    kind,
    ctx,
  );
}

describe("the isTest flag on built nodes", () => {
  it("is true for a function in a .test. file", () => {
    expect(functionNode("src/lib.test.ts", "check").isTest).toBe(true);
  });

  it("is true for a function under a tests folder", () => {
    expect(functionNode("tests/in-folder.ts", "inFolder").isTest).toBe(true);
  });

  it("is absent, not false, for a function in an ordinary file", () => {
    const node = functionNode("src/app.ts", "run");
    expect("isTest" in node).toBe(false);
  });

  it("flags the module box of a test file and not an ordinary one", () => {
    const testFile = project.getSourceFileOrThrow(
      `${MEMORY_ROOT}/src/lib.test.ts`,
    );
    const appFile = project.getSourceFileOrThrow(`${MEMORY_ROOT}/src/app.ts`);
    expect(buildModuleNode(testFile, ctx).isTest).toBe(true);
    expect("isTest" in buildModuleNode(appFile, ctx)).toBe(false);
  });

  it("never flags a node of kind external or unknown, whatever its path", () => {
    for (const kind of ["external", "unknown"] as const) {
      const node = functionNode("src/lib.test.ts", "check", kind);
      expect("isTest" in node, kind).toBe(false);
    }
  });

  it("flags a test-file focus and caller in a slice and no other node", () => {
    const file = `${MEMORY_ROOT}/src/lib.test.ts`;
    const text = project.getSourceFileOrThrow(file).getFullText();
    const slice = analyzeFocus(project, {
      file,
      offset: text.indexOf("return target"),
      repoRoot: MEMORY_ROOT,
    });
    const flags = slice.nodes
      .map((n) => [n.id, n.isTest === true] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    expect(flags).toEqual([
      ["src/lib.test.ts#check", true],
      ["src/lib.test.ts#helper", true],
      ["src/lib.ts#target", false],
    ]);
  });
});
