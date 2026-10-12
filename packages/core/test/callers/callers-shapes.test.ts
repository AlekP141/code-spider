import { describe, expect, it } from "vitest";
import { Project } from "ts-morph";
import { collectCallerEdges, MAX_CALLERS } from "../../src/callers/callers.js";
import { toFocusTarget } from "../../src/focus/focus.js";
import type { Range } from "../../src/types.js";

const ROOT = "/proj";
const LIB = "export function target(): number { return 1 }\n";
const IMPORT = 'import { target } from "./lib.js"\n';

/** Callers of `name` in `focusFile`, from an in-memory project of `files`. */
function callersOf(
  files: Record<string, string>,
  focusFile: string,
  name: string,
) {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${rel}`, text);
  }
  const sourceFile = project.getSourceFileOrThrow(`${ROOT}/${focusFile}`);
  const target = toFocusTarget(sourceFile.getFunctionOrThrow(name), sourceFile);
  return collectCallerEdges(target, `${focusFile}#${name}`, { repoRoot: ROOT });
}

const idsOf = (edges: { to: string }[]) => edges.map((e) => e.to);

function manyCallers(prefix: string, count: number): string {
  const lines = Array.from(
    { length: count },
    (_, i) => `export function ${prefix}${i + 1}(): number { return target() }`,
  );
  return IMPORT + lines.join("\n") + "\n";
}

describe("collectCallerEdges — caller shapes", () => {
  it("attributes a call inside an anonymous callback to the enclosing function", () => {
    const { edges } = callersOf(
      {
        "src/lib.ts": LIB,
        "src/app.ts":
          IMPORT +
          "export function outer(): number { return [1].map(() => target())[0] }\n",
      },
      "src/lib.ts",
      "target",
    );
    expect(idsOf(edges)).toEqual(["src/app.ts#outer"]);
  });

  it("accepts f.call(...) and f.apply(...) as calls of f", () => {
    const { edges } = callersOf(
      {
        "src/lib.ts": LIB,
        "src/app.ts":
          IMPORT +
          "export function viaCall(): number { return target.call(null) }\n" +
          "export function viaApply(): number { return target.apply(null, []) }\n",
      },
      "src/lib.ts",
      "target",
    );
    expect(idsOf(edges)).toEqual(["src/app.ts#viaCall", "src/app.ts#viaApply"]);
  });

  it("treats f.bind(...) as passing f, and f.toString() as no use", () => {
    const { edges } = callersOf(
      {
        "src/lib.ts": LIB,
        "src/app.ts":
          IMPORT +
          "export function viaString(): string { return target.toString() }\n" +
          "export function viaBind(): number { return target.bind(null)() }\n",
      },
      "src/lib.ts",
      "target",
    );
    expect(edges.map((e) => [e.to, e.kind])).toEqual([
      ["src/app.ts#viaBind", "passes"],
    ]);
  });

  it("finds callers that are arrow-const bindings and class methods", () => {
    const { edges } = callersOf(
      {
        "src/lib.ts": LIB,
        "src/app.ts":
          IMPORT +
          "export const viaArrow = (): number => target()\n" +
          "export class Worker { run(): number { return target() } }\n",
      },
      "src/lib.ts",
      "target",
    );
    expect(idsOf(edges)).toEqual(["src/app.ts#viaArrow", "src/app.ts#Worker.run"]);
  });

  it("excludes a self-recursive call and keeps the outside caller", () => {
    const { edges } = callersOf(
      {
        "src/lib.ts":
          "export function target(n: number): number { return n ? target(n - 1) : 0 }\n",
        "src/app.ts":
          IMPORT + "export function other(): number { return target(1) }\n",
      },
      "src/lib.ts",
      "target",
    );
    expect(idsOf(edges)).toEqual(["src/app.ts#other"]);
  });
});

describe("collectCallerEdges — cap boundary and order", () => {
  it("is not truncated at exactly MAX_CALLERS callers", () => {
    const { edges, truncated } = callersOf(
      { "src/lib.ts": LIB, "src/app.ts": manyCallers("c", MAX_CALLERS) },
      "src/lib.ts",
      "target",
    );
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(truncated).toBe(false);
  });

  it("truncates one caller past MAX_CALLERS and keeps exactly MAX_CALLERS", () => {
    const { edges, truncated } = callersOf(
      {
        "src/lib.ts": LIB,
        "src/app.ts": manyCallers("c", MAX_CALLERS + 1),
      },
      "src/lib.ts",
      "target",
    );
    expect(edges).toHaveLength(MAX_CALLERS);
    expect(truncated).toBe(true);
  });

  it("keeps the first MAX_CALLERS in file-path order, not reference order", () => {
    const { edges, truncated } = callersOf(
      {
        "src/lib.ts": LIB,
        "src/z.ts": manyCallers("z", 30),
        "src/a.ts": manyCallers("a", 30),
      },
      "src/lib.ts",
      "target",
    );
    const expected = [
      ...Array.from({ length: 30 }, (_, i) => `src/a.ts#a${i + 1}`),
      ...Array.from({ length: 20 }, (_, i) => `src/z.ts#z${i + 1}`),
    ];
    expect(idsOf(edges)).toEqual(expected);
    expect(truncated).toBe(true);
  });
});

/** The source text covered by a 1-based, end-exclusive range. */
function spanText(text: string, range: Range): string {
  const lines = text.split("\n");
  const offsetOf = (line: number, column: number) =>
    lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0) +
    column -
    1;
  return text.slice(
    offsetOf(range.startLine, range.startColumn),
    offsetOf(range.endLine, range.endColumn),
  );
}

describe("collectCallerEdges — callSite spans the whole call", () => {
  const appLines = [
    IMPORT + 'import * as lib from "./lib.js"',
    "export function direct(): number { return target(1) }",
    "export function viaNamespace(): number { return lib.target(1) }",
    "export function viaCall(): number { return target.call(null, 1) }",
    "export function viaApply(): number { return target.apply(null, [1]) }",
    "export function viaNamespaceCall(): number {\n" +
      "  return lib.target.call(null, 1)\n" +
      "}",
    "export function multiline(): number {",
    "  return target(",
    "    1,",
    "  )",
    "}",
  ];
  const app = appLines.join("\n") + "\n";
  const { edges } = callersOf(
    { "src/lib.ts": LIB, "src/app.ts": app },
    "src/lib.ts",
    "target",
  );
  const callSiteOf = (caller: string) => {
    const edge = edges.find((e) => e.to === `src/app.ts#${caller}`);
    if (!edge) throw new Error(`no edge from ${caller}`);
    return spanText(app, edge.callSite);
  };

  it("spans f(x)", () => {
    expect(callSiteOf("direct")).toBe("target(1)");
  });

  it("spans obj.f(x)", () => {
    expect(callSiteOf("viaNamespace")).toBe("lib.target(1)");
  });

  it("spans f.call(null, x)", () => {
    expect(callSiteOf("viaCall")).toBe("target.call(null, 1)");
  });

  it("spans f.apply(null, args)", () => {
    expect(callSiteOf("viaApply")).toBe("target.apply(null, [1])");
  });

  it("spans obj.f.call(null, x)", () => {
    expect(callSiteOf("viaNamespaceCall")).toBe("lib.target.call(null, 1)");
  });

  it("spans a multi-line call across lines", () => {
    expect(callSiteOf("multiline")).toBe("target(\n    1,\n  )");
  });
});
