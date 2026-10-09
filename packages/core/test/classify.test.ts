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
      "type ReactNode = JSX.Element | string | number | null | undefined",
      "export function View(): JSX.Element { return <div /> }",
      "export function renderRow(): JSX.Element { return <div /> }",
      "export function Panel(): ReactNode { return null }",
      "export function renderLabel(): ReactNode { return null }",
      "export function Maybe(): string | null { return null }",
      "export async function Later(): Promise<string> { return '' }",
      "export function Config(): { a: number } { return { a: 1 } }",
      "export const value = 1",
      "",
    ].join("\n"),
  }).getSourceFileOrThrow(`${MEMORY_ROOT}/src/kinds.tsx`);

  it("classifies a function returning JSX as component", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("View"))).toBe(
      "component",
    );
  });

  it("classifies any function returning JSX as component", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("renderRow"))).toBe(
      "component",
    );
  });

  it("classifies a PascalCase function returning ReactNode as component", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("Panel"))).toBe(
      "component",
    );
  });

  it("classifies a PascalCase function returning primitives as component", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("Maybe"))).toBe(
      "component",
    );
  });

  it("looks through Promise for an async component", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("Later"))).toBe(
      "component",
    );
  });

  it("keeps a lowercase ReactNode helper a function", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("renderLabel"))).toBe(
      "function",
    );
  });

  it("keeps a PascalCase function returning an object a function", () => {
    expect(classifyDeclaration(file.getFunctionOrThrow("Config"))).toBe(
      "function",
    );
  });

  it("classifies a non-callable declaration as unknown", () => {
    expect(
      classifyDeclaration(file.getVariableDeclarationOrThrow("value")),
    ).toBe("unknown");
  });
});
