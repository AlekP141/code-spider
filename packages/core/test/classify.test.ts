import { describe, expect, it } from "vitest";
import {
  classifyDeclaration,
  externalModuleOf,
  isExternalPath,
} from "../src/classify.js";
import { loadTestCode } from "./helpers.js";

describe("isExternalPath", () => {
  it("treats node_modules paths as external", () => {
    expect(isExternalPath("/repo/node_modules/tiny-lib/index.d.ts")).toBe(
      true,
    );
  });

  it("treats lib.*.d.ts builtins as external", () => {
    expect(isExternalPath("/ts/lib/lib.dom.d.ts")).toBe(true);
  });

  it("treats repo source as internal", () => {
    expect(isExternalPath("/repo/src/signup.ts")).toBe(false);
  });

  it("does not treat a repo .d.ts as external", () => {
    expect(isExternalPath("/repo/src/shims.d.ts")).toBe(false);
  });
});

describe("externalModuleOf", () => {
  it("extracts a package name", () => {
    expect(externalModuleOf("/repo/node_modules/tiny-lib/index.d.ts")).toBe(
      "tiny-lib",
    );
  });

  it("extracts a scoped package name", () => {
    expect(
      externalModuleOf("/repo/node_modules/@scope/pkg/dist/i.d.ts"),
    ).toBe("@scope/pkg");
  });

  it("uses the nearest node_modules for nested dependencies", () => {
    expect(
      externalModuleOf("/repo/node_modules/a/node_modules/b/i.d.ts"),
    ).toBe("b");
  });

  it("labels compiler builtins as lib", () => {
    expect(externalModuleOf("/ts/lib/lib.dom.d.ts")).toBe("lib");
  });

  it("labels lib files under node_modules/typescript as lib", () => {
    expect(
      externalModuleOf("/repo/node_modules/typescript/lib/lib.dom.d.ts"),
    ).toBe("lib");
  });
});

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
