import { describe, expect, it } from "vitest";
import { Project, ts } from "ts-morph";
import { externalModuleOf, isExternalFile } from "../../src/nodes/externals.js";

const project = new Project({
  useInMemoryFileSystem: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
});
const at = (path: string) =>
  project.createSourceFile(path, "export {}\n", { overwrite: true });

const promiseFile = project
  .createSourceFile("/repo/src/p.ts", "export const p = Promise.resolve(1)\n")
  .getVariableDeclarationOrThrow("p")
  .getType()
  .getSymbolOrThrow()
  .getDeclarations()[0]!
  .getSourceFile();

describe("isExternalFile", () => {
  it("treats node_modules files as external", () => {
    expect(isExternalFile(at("/repo/node_modules/tiny-lib/index.d.ts"))).toBe(
      true,
    );
  });

  it("treats the compiler's lib files as external", () => {
    expect(isExternalFile(promiseFile)).toBe(true);
  });

  it("treats repo source as internal", () => {
    expect(isExternalFile(at("/repo/src/signup.ts"))).toBe(false);
  });

  it("does not treat a repo .d.ts as external", () => {
    expect(isExternalFile(at("/repo/src/shims.d.ts"))).toBe(false);
  });

  it("does not treat a repo file named like a lib file as external", () => {
    expect(isExternalFile(at("/repo/src/lib.custom.d.ts"))).toBe(false);
  });
});

describe("externalModuleOf", () => {
  it("extracts a package name", () => {
    expect(externalModuleOf(at("/repo/node_modules/tiny-lib/index.d.ts"))).toBe(
      "tiny-lib",
    );
  });

  it("extracts a scoped package name", () => {
    expect(
      externalModuleOf(at("/repo/node_modules/@scope/pkg/dist/i.d.ts")),
    ).toBe("@scope/pkg");
  });

  it("keeps a lone scope segment without a trailing slash", () => {
    expect(externalModuleOf(at("/repo/node_modules/@scope.d.ts"))).toBe(
      "@scope.d.ts",
    );
  });

  it("uses the nearest node_modules for nested dependencies", () => {
    expect(
      externalModuleOf(at("/repo/node_modules/a/node_modules/b/i.d.ts")),
    ).toBe("b");
  });

  it("labels the compiler's lib files as lib", () => {
    expect(externalModuleOf(promiseFile)).toBe("lib");
  });

  it("names a package file that looks like a lib file after its package", () => {
    expect(
      externalModuleOf(at("/repo/node_modules/pkg/lib.extra.d.ts")),
    ).toBe("pkg");
  });
});
