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
    "export function runLost(missing: (s: string) => unknown) {",
    "  return missing('a')",
    "}",
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

function edgesInto(rel: string, needle: string) {
  const file = `${MEMORY_ROOT}/${rel}`;
  const offset = project
    .getSourceFileOrThrow(file)
    .getFullText()
    .indexOf(needle);
  const slice = analyzeFocus(project, { file, offset, repoRoot: MEMORY_ROOT });
  return slice.edges
    .filter((e) => e.to === slice.focusId)
    .map((e) => [e.from, e.kind, e.resolved]);
}

describe("calls on parameters and properties", () => {
  it("links a called parameter to the function passed for it", () => {
    expect(edgesInto("src/tool.ts", "runParam")).toContainEqual([
      "src/engine.ts#other",
      "injected",
      true,
    ]);
  });

  it("links a called property to the factory assigned to it", () => {
    expect(edgesInto("src/tool.ts", "runProp")).toContainEqual([
      "src/engine.ts#createGen",
      "injected",
      true,
    ]);
  });

  it("links a destructured name to the inline arrow's enclosing function", () => {
    expect(edgesInto("src/tool.ts", "runDestructured")).toContainEqual([
      "src/wire.ts#wire",
      "injected",
      true,
    ]);
  });

  it("keeps an unknown node when nothing is ever passed", () => {
    const edges = edgesInto("src/tool.ts", "runLost");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ 1: "call", 2: false });
  });
});
