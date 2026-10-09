import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { memoryProject, MEMORY_ROOT } from "./helpers.js";

const offsetIn = (
  project: ReturnType<typeof memoryProject>,
  file: string,
  needle: string,
) => {
  const at = project
    .getSourceFileOrThrow(`${MEMORY_ROOT}/${file}`)
    .getFullText()
    .indexOf(needle);
  if (at === -1) throw new Error(`needle not found: ${needle}`);
  return at;
};

const focusFrom = (
  project: ReturnType<typeof memoryProject>,
  file: string,
  needle: string,
) =>
  analyzeFocus(project, {
    file: `${MEMORY_ROOT}/${file}`,
    offset: offsetIn(project, file, needle),
    repoRoot: MEMORY_ROOT,
  });

describe("expandNode — overloads", () => {
  const project = memoryProject({
    "src/over.ts": [
      "export function over(a: string): void;",
      "export function over(a: number): void;",
      "export function over(a: unknown): void {",
      "  helper();",
      "}",
      "function helper(): void {}",
      "",
    ].join("\n"),
    "src/box.ts": [
      "export class Box {",
      "  put(a: string): void;",
      "  put(a: number): void;",
      "  put(a: unknown): void {",
      "    helper();",
      "  }",
      "}",
      "function helper(): void {}",
      "",
    ].join("\n"),
  });

  it("expands an overloaded function to its implementation", () => {
    const slice = expandNode(project, "src/over.ts#over", MEMORY_ROOT);

    expect(slice).toEqual(focusFrom(project, "src/over.ts", "helper();"));
    expect(slice.nodes.map((n) => n.id)).toContain("src/over.ts#helper");
  });

  it("expands an overloaded method to its implementation", () => {
    const slice = expandNode(project, "src/box.ts#Box.put", MEMORY_ROOT);

    expect(slice).toEqual(focusFrom(project, "src/box.ts", "helper();"));
    expect(slice.nodes.map((n) => n.id)).toContain("src/box.ts#helper");
  });

  it("does not count overload signatures toward ~index", () => {
    expect(() =>
      expandNode(project, "src/over.ts#over~1", MEMORY_ROOT),
    ).toThrow(/not found/);
  });

  it("keeps a lone ambient declaration expandable", () => {
    const ambient = memoryProject({
      "src/ambient.ts": "declare function ambient(a: number): number;\n",
    });
    const slice = expandNode(ambient, "src/ambient.ts#ambient", MEMORY_ROOT);

    expect(slice).toEqual(focusFrom(ambient, "src/ambient.ts", "declare"));
    expect(slice.focusId).toBe("src/ambient.ts#ambient");
  });
});

describe("expandNode — declared names", () => {
  const project = memoryProject({
    "src/nested.ts": [
      "export function outer(): number {",
      "  function inner(): number {",
      "    return 1",
      "  }",
      "  return inner()",
      "}",
      "",
    ].join("\n"),
    "src/fexpr.ts": [
      "export const legacy = function (n: number): number {",
      "  return n",
      "}",
      "",
    ].join("\n"),
    "src/dflt.ts": "export default function dflt(): number {\n  return 1\n}\n",
    "src/cb.ts": [
      "export const doubled = [1].map((n) => n * 2)",
      "export const items = [1].map(function (n) { return n })",
      "",
    ].join("\n"),
    "src/obj.ts": "export const handlers = { arrow: () => {} }\n",
  });

  it("resolves a nested function", () => {
    const slice = expandNode(project, "src/nested.ts#outer.inner", MEMORY_ROOT);

    expect(slice.focusId).toBe("src/nested.ts#outer.inner");
  });

  it("resolves a function-expression const by its variable name", () => {
    const slice = expandNode(project, "src/fexpr.ts#legacy", MEMORY_ROOT);

    expect(slice.nodes.find((n) => n.id === slice.focusId)?.name).toBe(
      "legacy",
    );
  });

  it("resolves a named default-exported function", () => {
    const slice = expandNode(project, "src/dflt.ts#dflt", MEMORY_ROOT);

    expect(slice.focusId).toBe("src/dflt.ts#dflt");
  });

  it("does not resolve an arrow passed as a callback argument", () => {
    expect(() => expandNode(project, "src/cb.ts#doubled", MEMORY_ROOT)).toThrow(
      /not found/,
    );
  });

  it("does not resolve an anonymous function expression argument", () => {
    expect(() => expandNode(project, "src/cb.ts#items", MEMORY_ROOT)).toThrow(
      /not found/,
    );
  });

  it("does not resolve an object-literal property arrow", () => {
    expect(() => expandNode(project, "src/obj.ts#arrow", MEMORY_ROOT)).toThrow(
      /not found/,
    );
  });
});
