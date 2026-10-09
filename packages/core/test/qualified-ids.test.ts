import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const APP = [
  "declare function useEffect(fn: () => void): void",
  "export function helper(): number { return 1 }",
  "export class A {",
  "  run(): number { return helper() }",
  "  static run(): number { return helper() }",
  "}",
  "export class B {",
  "  run(): number { return helper() }",
  "  tick = (): number => this.run()",
  "}",
  "export default class {",
  "  run(): number { return helper() }",
  "}",
  "export function Shell(): number {",
  "  const onClick = (): number => helper()",
  "  useEffect(() => {",
  "    function later(): number { return helper() }",
  "    later()",
  "  })",
  "  return onClick()",
  "}",
  "export function Other(): number {",
  "  const onClick = (): number => helper()",
  "  return onClick()",
  "}",
  "",
].join("\n");

const project = memoryProject({ "src/app.ts": APP });

function sliceAt(needle: string) {
  const file = project.getSourceFileOrThrow(`${MEMORY_ROOT}/src/app.ts`);
  const offset = file.getFullText().indexOf(needle);
  if (offset === -1) throw new Error(`needle not found: ${needle}`);
  return analyzeFocus(project, {
    file: file.getFilePath(),
    offset,
    repoRoot: MEMORY_ROOT,
  });
}

const helperCallers = sliceAt("return 1").edges.map((e) => e.to);

describe("node ids qualified by containers", () => {
  it("qualifies methods by class, with ~N for a remaining collision", () => {
    expect(helperCallers).toEqual(
      expect.arrayContaining([
        "src/app.ts#A.run",
        "src/app.ts#A.run~1",
        "src/app.ts#B.run",
        "src/app.ts#default.run",
      ]),
    );
  });

  it("qualifies nested functions by the named function holding them", () => {
    expect(helperCallers).toEqual(
      expect.arrayContaining([
        "src/app.ts#Shell.onClick",
        "src/app.ts#Other.onClick",
        "src/app.ts#Shell.later",
      ]),
    );
  });

  it("keeps the short name in the name field", () => {
    const node = sliceAt("return 1").nodes.find(
      (n) => n.id === "src/app.ts#Shell.onClick",
    );
    expect(node?.name).toBe("onClick");
  });

  it("names a class-property arrow and finds its callees", () => {
    const slice = sliceAt("this.run()");
    expect(slice.focusId).toBe("src/app.ts#B.tick");
    expect(slice.edges.map((e) => e.from)).toContain("src/app.ts#B.run");
  });

  it("expands every id in a slice back to the same focus", () => {
    const expandable = sliceAt("return 1").nodes.filter(
      (n) => n.kind === "function",
    );
    for (const { id } of expandable) {
      expect(expandNode(project, id, MEMORY_ROOT).focusId).toBe(id);
    }
  });

  it("expands the ~N match to the right declaration", () => {
    const slice = expandNode(project, "src/app.ts#A.run~1", MEMORY_ROOT);
    const focus = slice.nodes.find((n) => n.id === slice.focusId);
    expect(focus?.codePreview).toMatch(/^static run/);
  });
});
