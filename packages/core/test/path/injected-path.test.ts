import { describe, expect, it } from "vitest";
import { findPaths } from "../../src/path/find-paths.js";
import type { StopSignal } from "../../src/path/signal.js";
import { MEMORY_ROOT, memoryProject } from "../helpers.js";

const idle: StopSignal = { isRequested: () => false, reason: () => undefined };

const project = memoryProject({
  "src/engine.ts": [
    "function generateTurn(x: string): string { return x }",
    "export function createGen() {",
    "  return (input: string) => generateTurn(input)",
    "}",
    "",
  ].join("\n"),
  "src/tool.ts": [
    "export interface Deps { generate: (s: string) => unknown }",
    "export function createTool({ generate }: Deps) {",
    "  return () => generate('a')",
    "}",
    "",
  ].join("\n"),
  "src/wire.ts": [
    'import { createGen } from "./engine";',
    'import { createTool } from "./tool";',
    "export function wire() { return createTool({ generate: createGen() }) }",
    "",
  ].join("\n"),
});

describe("paths through injected functions", () => {
  it("finds the route from a function that calls a parameter to what is passed for it", () => {
    const outcome = findPaths(project, {
      from: "src/tool.ts#createTool",
      to: "src/engine.ts#generateTurn",
      repoRoot: MEMORY_ROOT,
      limits: { timeLimitMs: 5000, maxBoxes: 50 },
      signal: idle,
    });
    expect(outcome.status).toBe("found");
    if (outcome.status !== "found") return;
    expect(outcome.route.edges.map((e) => [e.from, e.to, e.kind])).toEqual(
      expect.arrayContaining([
        ["src/engine.ts#generateTurn", "src/engine.ts#createGen", "call"],
        ["src/engine.ts#createGen", "src/tool.ts#createTool", "injected"],
      ]),
    );
  });
});
