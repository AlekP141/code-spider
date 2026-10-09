import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analyzeFocus } from "../src/analyze.js";
import {
  findNearestTsconfig,
  loadProject,
  warmProject,
} from "../src/project.js";
import { loadTestCode, testCodePath } from "./helpers.js";

describe("findNearestTsconfig", () => {
  it("finds the tsconfig above a source file", () => {
    const found = findNearestTsconfig(testCodePath("basic", "src/signup.ts"));
    expect(found.replace(/\\/g, "/")).toMatch(/test-code\/basic\/tsconfig\.json$/);
  });

  it("throws when there is no tsconfig above the file", () => {
    expect(() => findNearestTsconfig("/nonexistent-root-dir/a.ts")).toThrow(/No tsconfig/);
  });
});

describe("loadProject", () => {
  it("loads the test-code source files", () => {
    const project = loadProject(findNearestTsconfig(testCodePath("basic", "src/signup.ts")));
    const names = project
      .getSourceFiles()
      .map((f) => f.getBaseName())
      .sort();
    expect(names).toEqual(["app.ts", "signup.ts", "types.ts"]);
  });

  it("resolves real types across files", () => {
    const project = loadProject(findNearestTsconfig(testCodePath("basic", "src/signup.ts")));
    const fn = project.getSourceFileOrThrow("signup.ts").getFunctionOrThrow("validateUser");
    expect(fn.getReturnType().getText()).toContain("ValidUserData");
  });
});

describe("warmProject", () => {
  it("leaves analysis unchanged and keeps the language service program", () => {
    const { project, root } = loadTestCode("basic");
    warmProject(project);
    const program = project.getLanguageService().compilerObject.getProgram();

    const file = testCodePath("basic", "src/signup.ts");
    const offset = readFileSync(file, "utf8").indexOf("const valid");
    const slice = analyzeFocus(project, { file, offset, repoRoot: root });

    const golden = new URL(
      "./__goldens__/basic-handleSignup.json",
      import.meta.url,
    );
    expect(JSON.parse(JSON.stringify(slice))).toEqual(
      JSON.parse(readFileSync(golden, "utf8")),
    );
    expect(project.getLanguageService().compilerObject.getProgram()).toBe(
      program,
    );
  });
});
