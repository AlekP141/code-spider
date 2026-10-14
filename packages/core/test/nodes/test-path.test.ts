import { describe, expect, it } from "vitest";
import { isTestPath } from "../../src/nodes/test-path.js";

const EXTENSIONS = ["ts", "tsx", "js", "mjs"];

describe("isTestPath", () => {
  it("treats a .test. file name as test code in any extension", () => {
    for (const ext of EXTENSIONS) {
      const path = `src/a.test.${ext}`;
      expect(isTestPath(path), path).toBe(true);
    }
  });

  it("treats a .spec. file name as test code in any extension", () => {
    for (const ext of EXTENSIONS) {
      const path = `src/a.spec.${ext}`;
      expect(isTestPath(path), path).toBe(true);
    }
  });

  it("treats every file below a test folder as test code, at any depth", () => {
    for (const folder of ["__tests__", "test", "tests"]) {
      for (const path of [
        `${folder}/a.ts`,
        `packages/x/${folder}/deep/er/a.ts`,
      ]) {
        expect(isTestPath(path), path).toBe(true);
      }
    }
  });

  it("matches a folder only as a whole segment", () => {
    for (const folder of ["testing", "contest", "latest", "my-tests"]) {
      const path = `src/${folder}/a.ts`;
      expect(isTestPath(path), path).toBe(false);
    }
  });

  it("does not take the file name for a folder or half a marker", () => {
    for (const path of ["src/test.ts", "src/spec.ts", "src/a.test"]) {
      expect(isTestPath(path), path).toBe(false);
    }
  });

  it("is case-sensitive", () => {
    for (const path of ["Tests/a.ts", "src/a.Test.ts", "src/TEST/a.ts"]) {
      expect(isTestPath(path), path).toBe(false);
    }
  });

  it("is false for an empty path and for an ordinary path", () => {
    expect(isTestPath("")).toBe(false);
    expect(isTestPath("src/app/main.ts")).toBe(false);
  });
});
