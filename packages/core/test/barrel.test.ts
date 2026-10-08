import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../src/analyze.js";
import { loadTestCode, testCodePath } from "./helpers.js";

/** Adds in-memory files to the barrel project, then slices at `needle`. */
function sliceWithin(
  files: Record<string, string>,
  focus: string,
  needle: string,
) {
  const { project, root } = loadTestCode("barrel");
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(join(root, rel), text);
  }
  const file = join(root, focus);
  const text = project.getSourceFileOrThrow(file).getFullText();
  return analyzeFocus(project, {
    file,
    offset: text.indexOf(needle),
    repoRoot: root,
  });
}

describe("barrel re-exports", () => {
  const { project, root } = loadTestCode("barrel");
  const text = project.getSourceFileOrThrow("consumer.ts").getFullText();

  const slice = analyzeFocus(project, {
    file: testCodePath("barrel", "src/consumer.ts"),
    offset: text.indexOf("values.reduce"),
    repoRoot: root,
  });

  it("resolves the callee to its defining file, not the barrel", () => {
    expect(slice.nodes.some((n) => n.id === "src/inner/math.ts#add")).toBe(
      true,
    );
    expect(slice.nodes.some((n) => n.id === "src/inner/index.ts#add")).toBe(
      false,
    );
  });

  it("labels the edge with the real return type", () => {
    const edge = slice.edges.find((e) => e.from === "src/inner/math.ts#add");
    expect(edge?.supplies).toBe("number");
  });
});

describe("named re-exports through a barrel", () => {
  const slice = sliceWithin(
    {
      "src/inner/named.ts": `export { add } from './math.js'\n`,
      "src/named-consumer.ts": [
        `import { add } from './inner/named.js'`,
        ``,
        `export function sumPair(a: number, b: number): number {`,
        `  return add(a, b)`,
        `}`,
        ``,
      ].join("\n"),
    },
    "src/named-consumer.ts",
    "add(a, b)",
  );

  it("resolves a named re-export to the defining file", () => {
    expect(slice.focusId).toBe("src/named-consumer.ts#sumPair");
    expect(slice.nodes.some((n) => n.id === "src/inner/math.ts#add")).toBe(
      true,
    );
    expect(slice.nodes.some((n) => n.id === "src/inner/named.ts#add")).toBe(
      false,
    );
  });

  it("labels the edge with the real return type", () => {
    const edge = slice.edges.find((e) => e.from === "src/inner/math.ts#add");
    expect(edge?.supplies).toBe("number");
  });
});

describe("renamed re-exports through a barrel", () => {
  const slice = sliceWithin(
    {
      "src/inner/renamed.ts": `export { add as plus } from './math.js'\n`,
      "src/renamed-consumer.ts": [
        `import { plus } from './inner/renamed.js'`,
        ``,
        `export function sumPair(a: number, b: number): number {`,
        `  return plus(a, b)`,
        `}`,
        ``,
      ].join("\n"),
    },
    "src/renamed-consumer.ts",
    "plus(a, b)",
  );

  it("names the node after the declaration, not the local alias", () => {
    expect(slice.focusId).toBe("src/renamed-consumer.ts#sumPair");
    expect(slice.nodes.some((n) => n.id === "src/inner/math.ts#add")).toBe(
      true,
    );
    expect(slice.nodes.some((n) => n.id.endsWith("#plus"))).toBe(false);
    expect(slice.nodes.some((n) => n.id === "src/inner/renamed.ts#plus")).toBe(
      false,
    );
  });

  it("labels the edge with the real return type", () => {
    const edge = slice.edges.find((e) => e.from === "src/inner/math.ts#add");
    expect(edge?.supplies).toBe("number");
  });
});
