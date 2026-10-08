import { describe, expect, it } from "vitest";
import { classifyDeclaration } from "../src/classify.js";
import { MEMORY_ROOT, loadTestCode, memoryProject } from "./helpers.js";

describe("classifyDeclaration", () => {
  const { project } = loadTestCode("externals");
  const uses = project.getSourceFileOrThrow("uses.ts");

  it("classifies a repo function as function", () => {
    expect(classifyDeclaration(uses.getFunctionOrThrow("local"))).toBe(
      "function",
    );
  });

  it("classifies a node_modules declaration as external", () => {
    const persist = uses
      .getImportDeclarationOrThrow("tiny-lib")
      .getNamedImports()[0]!
      .getNameNode()
      .getSymbolOrThrow()
      .getAliasedSymbolOrThrow()
      .getDeclarations()[0]!;
    expect(classifyDeclaration(persist)).toBe("external");
  });
});

describe("classifyDeclaration — repo declarations", () => {
  const file = memoryProject({
    "src/kinds.tsx": [
      "export function View(): JSX.Element { return <div /> }",
      "export const value = 1",
      "",
    ].join("\n"),
  }).getSourceFileOrThrow(`${MEMORY_ROOT}/src/kinds.tsx`);

  it("classifies a function returning JSX as component", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("View"))).toBe(
      "component",
    );
  });

  it("classifies a non-callable declaration as unknown", () => {
    expect(
      classifyDeclaration(file.getVariableDeclarationOrThrow("value")),
    ).toBe("unknown");
  });
});
