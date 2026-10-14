import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { collectCallerEdges, MAX_CALLERS } from "../../src/callers/callers.js";
import { toFocusTarget } from "../../src/focus/focus.js";

const ROOT = "/proj";
const LIB = "export function target(n: number): number { return n }\n";
const IMPORT = 'import { target } from "./lib.js"\n';

function callersOfTarget(files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/src/lib.ts`, LIB);
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${rel}`, text);
  }
  const lib = project.getSourceFileOrThrow(`${ROOT}/src/lib.ts`);
  const focus = toFocusTarget(lib.getFunctionOrThrow("target"), lib);
  return collectCallerEdges(focus, "src/lib.ts#target", { repoRoot: ROOT });
}

function callers(prefix: string, count: number): string {
  const lines = Array.from(
    { length: count },
    (_, i) =>
      `export function ${prefix}${i + 1}(): number { return target(${i}) }`,
  );
  return IMPORT + lines.join("\n") + "\n";
}

const firstTestIds = (count: number) =>
  Array.from({ length: count }, (_, i) => `src/app.test.ts#t${i + 1}`);

const keptTestIds = (edges: { to: string }[]) =>
  edges.map((e) => e.to).filter((id) => id.startsWith("src/app.test.ts#"));

const testFlags = (nodes: { isTest?: true }[]) =>
  nodes.filter((n) => n.isTest).length;

describe("collectCallerEdges — test callers and the cap", () => {
  it("returns test callers, flagged, when there is room", () => {
    const { nodes, edges, truncated } = callersOfTarget({
      "src/app.ts": callers("r", 2),
      "src/app.test.ts": callers("t", 3),
    });
    expect(edges).toHaveLength(5);
    expect(testFlags(nodes)).toBe(3);
    expect(nodes.filter((n) => n.isTest).map((n) => n.file)).toEqual([
      "src/app.test.ts",
      "src/app.test.ts",
      "src/app.test.ts",
    ]);
    expect(truncated).toBe(false);
  });

  it("never lets test callers push real callers out, even when their file sorts first", () => {
    const { nodes, edges, truncated } = callersOfTarget({
      "src/a.test.ts": callers("t", MAX_CALLERS),
      "src/b.ts": callers("r", MAX_CALLERS),
    });
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(testFlags(nodes)).toBe(0);
    expect(edges.every((e) => e.to.startsWith("src/b.ts#"))).toBe(true);
    expect(truncated).toBe(true);
  });

  it("keeps 10 real and 40 of 60 test callers, truncated", () => {
    const { nodes, edges, truncated } = callersOfTarget({
      "src/app.ts": callers("r", 10),
      "src/app.test.ts": callers("t", 60),
    });
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(testFlags(nodes)).toBe(40);
    expect(nodes.length - testFlags(nodes)).toBe(10);
    expect(keptTestIds(edges)).toEqual(firstTestIds(40));
    expect(truncated).toBe(true);
  });

  it("keeps 50 real callers and drops a single test caller, truncated", () => {
    const { nodes, edges, truncated } = callersOfTarget({
      "src/app.ts": callers("r", MAX_CALLERS),
      "src/app.test.ts": callers("t", 1),
    });
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(testFlags(nodes)).toBe(0);
    expect(truncated).toBe(true);
  });

  it("keeps exactly 50 of 51 real callers and no test caller, truncated", () => {
    const { nodes, edges, truncated } = callersOfTarget({
      "src/app.ts": callers("r", MAX_CALLERS + 1),
      "src/app.test.ts": callers("t", 5),
    });
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(testFlags(nodes)).toBe(0);
    expect(truncated).toBe(true);
  });

  it("keeps all of exactly MAX_CALLERS mixed callers, not truncated", () => {
    const { edges, truncated } = callersOfTarget({
      "src/app.ts": callers("r", 30),
      "src/app.test.ts": callers("t", 20),
    });
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(truncated).toBe(false);
  });

  it("keeps MAX_CALLERS of one past MAX_CALLERS mixed callers, truncated", () => {
    const { edges, truncated } = callersOfTarget({
      "src/app.ts": callers("r", 30),
      "src/app.test.ts": callers("t", 21),
    });
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(keptTestIds(edges)).toEqual(firstTestIds(20));
    expect(truncated).toBe(true);
  });

  it("returns the kept callers in reference order, test and real interleaved", () => {
    const { edges } = callersOfTarget({
      "src/a.ts": callers("a", 1),
      "src/b.test.ts": callers("b", 1),
      "src/c.ts": callers("c", 1),
      "src/d.spec.ts": callers("d", 1),
    });
    expect(edges.map((e) => e.to)).toEqual([
      "src/a.ts#a1",
      "src/b.test.ts#b1",
      "src/c.ts#c1",
      "src/d.spec.ts#d1",
    ]);
  });

  it("makes a top-level it callback one module caller keeping its first call site", () => {
    const text =
      IMPORT +
      "declare function it(name: string, body: () => void): void\n" +
      'it("first", () => {\n' +
      "  target(1)\n" +
      "  target(2)\n" +
      "})\n" +
      'it("second", () => { target(3) })\n';
    const { nodes, edges } = callersOfTarget({ "src/lib.test.ts": text });
    expect(edges.map((e) => e.to)).toEqual(["src/lib.test.ts#<module>"]);
    expect(nodes.map((n) => [n.id, n.kind, n.isTest])).toEqual([
      ["src/lib.test.ts#<module>", "module", true],
    ]);
    expect(edges[0]?.callSite).toMatchObject({
      startLine: 4,
      startColumn: 3,
      endLine: 4,
      endColumn: 12,
    });
  });

  it("keeps nodes one-to-one with the kept edges", () => {
    const { nodes, edges } = callersOfTarget({
      "src/app.ts": callers("r", 45),
      "src/app.test.ts": callers("t", 20),
    });
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(nodes.map((n) => n.id)).toEqual(edges.map((e) => e.to));
  });
});
