import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "../helpers.js";

const project = memoryProject({
  "src/engine.ts": [
    "export function generateTurn(x: string): string { return x }",
    "export function createGen() {",
    "  return async (input: string) => generateTurn(input)",
    "}",
    "export function other(x: string): string { return x }",
    "",
  ].join("\n"),
  "src/tool.ts": [
    "export function runParam(generate: (s: string) => unknown) {",
    "  return generate('a')",
    "}",
    "export interface Deps { generate: (s: string) => unknown }",
    "export function runProp(deps: Deps) { return deps.generate('a') }",
    "export function runDestructured({ generate }: Deps) { return generate('a') }",
    "",
  ].join("\n"),
  "src/wire.ts": [
    'import { createGen, other } from "./engine";',
    'import { runParam, runProp, runDestructured } from "./tool";',
    "export function wire(extra: string) {",
    "  runParam(other)",
    "  runProp({ generate: createGen() })",
    "  runDestructured({ generate: (s) => other(s + extra) })",
    "}",
    "",
  ].join("\n"),
});

function callersOf(rel: string, needle: string) {
  const file = `${MEMORY_ROOT}/${rel}`;
  const text = project.getSourceFileOrThrow(file).getFullText();
  const slice = analyzeFocus(project, {
    file,
    offset: text.indexOf(needle),
    repoRoot: MEMORY_ROOT,
  });
  return slice.edges
    .filter((e) => e.from === slice.focusId)
    .map((e) => [e.to, e.kind]);
}

describe("callers through parameters and properties", () => {
  it("finds who calls the parameter a function is passed for", () => {
    expect(callersOf("src/engine.ts", "function other")).toContainEqual([
      "src/tool.ts#runParam",
      "injected",
    ]);
  });

  it("finds who calls the property a factory's result is assigned to", () => {
    expect(callersOf("src/engine.ts", "function createGen")).toEqual(
      expect.arrayContaining([
        ["src/tool.ts#runProp", "injected"],
        ["src/wire.ts#wire", "call"],
      ]),
    );
  });
});
