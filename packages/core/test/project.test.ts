import { describe, expect, it } from "vitest";
import { findNearestTsconfig, loadProject } from "../src/project.js";
import { fixturePath } from "./helpers.js";

describe("findNearestTsconfig", () => {
  it("finds the tsconfig above a source file", () => {
    const found = findNearestTsconfig(fixturePath("basic", "src/signup.ts"));
    expect(found.replace(/\\/g, "/")).toMatch(/fixtures\/basic\/tsconfig\.json$/);
  });

  it("throws when there is no tsconfig above the file", () => {
    expect(() => findNearestTsconfig("/nonexistent-root-dir/a.ts")).toThrow(/No tsconfig/);
  });
});

describe("loadProject", () => {
  it("loads the fixture source files", () => {
    const project = loadProject(findNearestTsconfig(fixturePath("basic", "src/signup.ts")));
    const names = project
      .getSourceFiles()
      .map((f) => f.getBaseName())
      .sort();
    expect(names).toEqual(["app.ts", "signup.ts", "types.ts"]);
  });

  it("resolves real types across files", () => {
    const project = loadProject(findNearestTsconfig(fixturePath("basic", "src/signup.ts")));
    const fn = project.getSourceFileOrThrow("signup.ts").getFunctionOrThrow("validateUser");
    expect(fn.getReturnType().getText()).toContain("ValidUserData");
  });
});
