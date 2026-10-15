import { describe, expect, it } from "vitest";
import {
  collectCallerEdges,
  MAX_CALLERS,
} from "../../src/callers/callers.js";
import { targetFor } from "../../src/path/ends.js";
import { SearchStopped, type StopSignal } from "../../src/path/signal.js";
import { TypeScriptSource } from "../../src/path/typescript-source.js";
import { memoryProject, MEMORY_ROOT } from "../helpers.js";

const LIB =
  "export function target(n: number): number { return n }\nexport function Card() { return null }\n";
const IMPORT = 'import { target } from "./lib.js"\n';
const TARGET = "src/lib.ts#target";
const OTHER_END = "src/far.ts#far";
const FAR = "export function far() {}\n";

const idle: StopSignal = {
  isRequested: () => false,
  reason: () => undefined,
};

function sourceFor(
  files: Record<string, string>,
  ends = { a: TARGET, b: OTHER_END },
  signal: StopSignal = idle,
) {
  const project = memoryProject({
    "src/lib.ts": LIB,
    "src/far.ts": FAR,
    ...files,
  });
  return {
    project,
    source: new TypeScriptSource(project, MEMORY_ROOT, ends, signal),
  };
}

describe("TypeScriptSource.callersOf", () => {
  it("returns call, JSX and passes links, supplier to consumer, with their call sites", () => {
    const { source } = sourceFor({
      "src/use.tsx": [
        'import { Card } from "./lib.js"',
        "export function a() { return Card() }",
        "export function b() { return [1].map(Card) }",
        "export const C = () => <Card />",
      ].join("\n"),
    });
    const links = source.callersOf("src/lib.ts#Card");
    expect(links.map(({ consumer, kind }) => [consumer, kind])).toEqual([
      ["src/use.tsx#a", "call"],
      ["src/use.tsx#b", "passes"],
      ["src/use.tsx#C", "jsx"],
    ]);
    expect(links.every((link) => link.supplier === "src/lib.ts#Card")).toBe(
      true,
    );
    expect(links[0]?.site).toEqual({
      startLine: 2,
      startColumn: 30,
      endLine: 2,
      endColumn: 36,
    });
  });

  it("keeps one link per caller and kind, the first use in reference order supplying the site", () => {
    const { source } = sourceFor({
      "src/use.ts": `${IMPORT}export function a() {\n  target(1)\n  target(2)\n}\n`,
    });
    const links = source.callersOf(TARGET);
    expect(links).toHaveLength(1);
    expect(links[0]?.site.startLine).toBe(3);
  });

  it("gives the file's module caller for top-level use", () => {
    const { source } = sourceFor({ "src/use.ts": `${IMPORT}target(1)\n` });
    expect(source.callersOf(TARGET).map((link) => link.consumer)).toEqual([
      "src/use.ts#<module>",
    ]);
  });

  it("does not link a recursive call", () => {
    const { source } = sourceFor({
      "src/lib.ts": "export function target(n: number): number { return target(n) }\n",
    });
    expect(source.callersOf(TARGET)).toEqual([]);
  });

  it("drops a test-file caller", () => {
    const { source } = sourceFor({
      "src/use.test.ts": `${IMPORT}export function t() { target(1) }\n`,
      "src/use.ts": `${IMPORT}export function r() { target(1) }\n`,
    });
    expect(source.callersOf(TARGET).map((link) => link.consumer)).toEqual([
      "src/use.ts#r",
    ]);
  });

  it("drops a test file's top-level code as a caller", () => {
    const { source } = sourceFor({
      "src/use.test.ts": `${IMPORT}target(1)\n`,
      "src/use.ts": `${IMPORT}export function r() { target(1) }\n`,
    });
    expect(source.callersOf(TARGET).map((link) => link.consumer)).toEqual([
      "src/use.ts#r",
    ]);
  });

  it("keeps a test-file caller when it is the start or the end", () => {
    const files = {
      "src/use.test.ts": `${IMPORT}export function t() { target(1) }\n`,
    };
    for (const ends of [
      { a: "src/use.test.ts#t", b: OTHER_END },
      { a: OTHER_END, b: "src/use.test.ts#t" },
    ]) {
      const { source } = sourceFor(files, ends);
      expect(source.callersOf(TARGET).map((link) => link.consumer)).toEqual([
        "src/use.test.ts#t",
      ]);
    }
  });

  it("finds the callers of an alias chain", () => {
    const { source } = sourceFor({
      "src/use.ts": `${IMPORT}const first = target\nconst second = first\nexport function a() { return second(1) }\n`,
    });
    const links = source.callersOf(TARGET);
    expect(links).toContainEqual(
      expect.objectContaining({ consumer: "src/use.ts#a", kind: "call" }),
    );
  });

  it("returns all callers past the display cap of 50", () => {
    const count = MAX_CALLERS + 20;
    const lines = Array.from(
      { length: count },
      (_, i) => `export function c${i}() { target(${i}) }`,
    );
    const { source } = sourceFor({ "src/use.ts": IMPORT + lines.join("\n") });
    expect(source.callersOf(TARGET)).toHaveLength(count);
  });

  it("throws SearchStopped when the signal trips during a climb, and when the finder token trips", () => {
    const files = {
      "src/use.ts": `${IMPORT}export function a() { target(1) }\nexport function b() { target(2) }\n`,
    };
    let asked = 0;
    const counting: StopSignal = {
      isRequested: () => (asked += 1) < 0,
      reason: () => undefined,
    };
    sourceFor(files, undefined, counting).source.callersOf(TARGET);
    const total = asked;
    expect(total).toBeGreaterThan(2);

    for (const trippingAt of [1, total]) {
      let calls = 0;
      const tripping: StopSignal = {
        isRequested: () => (calls += 1) >= trippingAt,
        reason: () => "cancelled",
      };
      const { source } = sourceFor(files, undefined, tripping);
      expect(() => source.callersOf(TARGET)).toThrow(SearchStopped);
    }
  });

  it("makes the same consumer ids as collectCallerEdges for the same callers", () => {
    const { project, source } = sourceFor({
      "src/use.tsx": [
        IMPORT.trimEnd(),
        "export function a() { return target(1) }",
        "export class K { run() { target(2) } static run() { target(3) } }",
        "export const C = () => <target />",
        "target(4)",
      ].join("\n"),
    });
    const ids = source.callersOf(TARGET).map((link) => link.consumer);
    const { edges } = collectCallerEdges(
      targetFor(project, TARGET, MEMORY_ROOT),
      TARGET,
      { repoRoot: MEMORY_ROOT },
    );
    expect(ids.sort()).toEqual(edges.map((edge) => edge.to).sort());
  });
});
