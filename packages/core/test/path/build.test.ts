import { describe, expect, it } from "vitest";
import { collectCallerEdges } from "../../src/callers/callers.js";
import { buildRoute } from "../../src/path/build.js";
import { targetFor } from "../../src/path/ends.js";
import { searchRoutes } from "../../src/path/search.js";
import type { StopSignal } from "../../src/path/signal.js";
import { TypeScriptSource } from "../../src/path/typescript-source.js";
import { memoryProject, MEMORY_ROOT } from "../helpers.js";

const A = "src/fns.ts#a";
const B = "src/fns.ts#b";
const MAIN = "src/main.ts#<module>";
const ctx = { repoRoot: MEMORY_ROOT };
const idle: StopSignal = { isRequested: () => false, reason: () => undefined };

const project = memoryProject({
  "src/fns.ts": [
    "export function a(): number { return 1 }",
    "export function b(): string { return '' }",
    "export function unrelated() {}",
  ].join("\n"),
  "src/main.ts": 'import { a, b } from "./fns.js"\na()\nb()\na()\n',
});

function built() {
  const ends = { a: A, b: B };
  const source = new TypeScriptSource(project, MEMORY_ROOT, ends, idle);
  const result = searchRoutes(source, { ...ends, maxBoxes: 200, signal: idle });
  if (result.status !== "found") throw new Error("expected a route");
  return { route: buildRoute(source, result.arranged, ctx) };
}

describe("buildRoute", () => {
  it("builds nodes only for the kept functions and a module caller as a module box", () => {
    const { route } = built();
    expect(route.nodes.map((node) => [node.id, node.kind])).toEqual([
      [A, "function"],
      [B, "function"],
      [MAIN, "module"],
    ]);
  });

  it("gives an edge the supplier's label for its kind and the first call site", () => {
    const { route } = built();
    const edge = route.edges.find((e) => e.from === A);
    expect(edge).toMatchObject({
      to: MAIN,
      kind: "call",
      supplies: "number",
      resolved: true,
    });
    expect(edge?.callSite.startLine).toBe(2);
    const other = route.edges.find((e) => e.from === B);
    expect(other?.supplies).toBe("string");
  });

  it("sorts nodes and edges by id", () => {
    const { route } = built();
    const ids = (items: { id: string }[]) => items.map((item) => item.id);
    expect(ids(route.nodes)).toEqual([...ids(route.nodes)].sort());
    expect(ids(route.edges)).toEqual([...ids(route.edges)].sort());
  });

  it("makes edge ids equal to those collectCallerEdges makes for the same pair and kind", () => {
    const { route } = built();
    const { edges } = collectCallerEdges(
      targetFor(project, A, MEMORY_ROOT),
      A,
      ctx,
    );
    const fromA = route.edges.find((e) => e.from === A);
    expect(edges.map((e) => e.id)).toContain(fromA?.id);
  });
});
