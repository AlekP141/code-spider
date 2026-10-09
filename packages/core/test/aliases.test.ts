import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const project = memoryProject({
  "src/util.ts": "export function cn(x: string): string { return x }\n",
  "src/page.ts": [
    'import { cn } from "./util";',
    "const alias = cn",
    "const again = alias",
    "let mutable = cn",
    "// @ts-ignore",
    "const loopA = loopB",
    "// @ts-ignore",
    "const loopB = loopA",
    "export function viaAlias(): string {",
    "  return alias('a')",
    "}",
    "export function viaChain(): string[] {",
    "  return ['b'].map(again)",
    "}",
    "export function viaLet(): string {",
    "  return mutable('c')",
    "}",
    "export function viaLoop(): unknown {",
    "  return loopA()",
    "}",
    "",
  ].join("\n"),
});

function sliceAt(rel: string, needle: string) {
  const file = `${MEMORY_ROOT}/${rel}`;
  const text = project.getSourceFileOrThrow(file).getFullText();
  const offset = text.indexOf(needle);
  if (offset === -1) throw new Error(`needle not found: ${needle}`);
  return analyzeFocus(project, { file, offset, repoRoot: MEMORY_ROOT });
}

const into = (slice: ReturnType<typeof sliceAt>) =>
  slice.edges
    .filter((e) => e.to === slice.focusId)
    .map((e) => [e.from, e.kind]);

describe("const aliases of functions", () => {
  it("resolves a call through an alias to the function", () => {
    expect(into(sliceAt("src/page.ts", "alias('a')"))).toEqual([
      ["src/util.ts#cn", "call"],
    ]);
  });

  it("resolves a pass through a chain of aliases", () => {
    expect(into(sliceAt("src/page.ts", "map(again)"))).toContainEqual([
      "src/util.ts#cn",
      "passes",
    ]);
  });

  it("finds callers through aliases from the function's side", () => {
    const cn = sliceAt("src/util.ts", "return x");
    const out = cn.edges.filter((e) => e.from === cn.focusId);
    expect(out.map((e) => [e.to, e.kind])).toEqual([
      ["src/page.ts#viaAlias", "call"],
      ["src/page.ts#viaChain", "passes"],
    ]);
  });

  it("does not follow a let, which can be reassigned", () => {
    const slice = sliceAt("src/page.ts", "mutable('c')");
    expect(into(slice)).toEqual([
      ["unknown:src/page.ts#viaLet#mutable", "call"],
    ]);
  });

  it("does not loop on aliases of each other", () => {
    expect(() => sliceAt("src/page.ts", "loopA()")).not.toThrow();
  });
});
