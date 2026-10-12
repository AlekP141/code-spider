import { describe, expect, it, vi } from "vitest";
import { Node, SyntaxKind, type Identifier } from "ts-morph";
import { analyzeFocus } from "../../src/analyze.js";
import { findReferenceNodes } from "../../src/callers/references.js";
import { loadTestCode, testCodePath } from "../helpers.js";

const where = (node: Node) =>
  `${node.getSourceFile().getBaseName()}:${node.getStart()}`;

function declaredNames(name: string): Identifier[] {
  const { project } = loadTestCode(name);
  return project.getSourceFiles().flatMap((file) =>
    [
      ...file.getDescendantsOfKind(SyntaxKind.FunctionDeclaration),
      ...file.getDescendantsOfKind(SyntaxKind.VariableDeclaration),
    ]
      .map((declaration) => declaration.getNameNode())
      .filter((nameNode) => Node.isIdentifier(nameNode)),
  );
}

describe("findReferenceNodes", () => {
  for (const name of ["basic", "externals", "jsx", "hub", "barrel"]) {
    it(`matches the language service on test-code/${name}`, () => {
      const names = declaredNames(name);
      expect(names.length).toBeGreaterThan(0);
      for (const nameNode of names) {
        expect(findReferenceNodes(nameNode).map(where)).toEqual(
          nameNode.findReferencesAsNodes().map(where),
        );
      }
    });
  }

  it("never asks the language service during analysis", () => {
    const { project, root } = loadTestCode("basic");
    const service = project.getLanguageService().compilerObject;
    const findReferences = vi.spyOn(service, "findReferences");
    const getProgram = vi.spyOn(service, "getProgram");

    const file = testCodePath("basic", "src/signup.ts");
    const text = project.getSourceFileOrThrow(file).getFullText();
    analyzeFocus(project, {
      file,
      offset: text.indexOf("const valid"),
      repoRoot: root,
    });

    expect(findReferences).not.toHaveBeenCalled();
    expect(getProgram).not.toHaveBeenCalled();
  });
});
