import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { analyzeFocus } from "../../src/analyze.js";
import {
  findTsconfig,
  loadProject,
  warmProject,
} from "../../src/project/project.js";
import { loadTestCode, testCodePath } from "../helpers.js";

/** Writes `files` under a fresh temp directory and returns its path. */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "code-spider-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

const config = (body: object) => JSON.stringify(body);
const MONOREPO = {
  ".git/HEAD": "",
  "tsconfig.json": config({ include: ["packages"] }),
  "packages/math/tsconfig.json": config({ include: ["src"] }),
  "packages/math/src/point.ts": "export const x = 1\n",
  "examples/tsconfig.json": config({}),
  "examples/demo.ts": "export const y = 1\n",
};

describe("findTsconfig", () => {
  it("finds the tsconfig above a source file", () => {
    const found = findTsconfig(testCodePath("basic", "src/signup.ts"));
    expect(found.replace(/\\/g, "/")).toMatch(/test-code\/basic\/tsconfig\.json$/);
  });

  it("throws when there is no tsconfig above the file", () => {
    expect(() => findTsconfig("/nonexistent-root-dir/a.ts")).toThrow(/No tsconfig/);
  });

  it("prefers the largest tsconfig that contains the file", () => {
    const root = tree(MONOREPO);
    expect(findTsconfig(join(root, "packages/math/src/point.ts"))).toBe(
      join(root, "tsconfig.json"),
    );
  });

  it("uses the nearest tsconfig when the larger one excludes the file", () => {
    const root = tree(MONOREPO);
    expect(findTsconfig(join(root, "examples/demo.ts"))).toBe(
      join(root, "examples/tsconfig.json"),
    );
  });

  it("skips a root that only lists project references", () => {
    const root = tree({
      ...MONOREPO,
      "tsconfig.json": config({
        files: [],
        references: [{ path: "packages/math" }],
      }),
    });
    expect(findTsconfig(join(root, "packages/math/src/point.ts"))).toBe(
      join(root, "packages/math/tsconfig.json"),
    );
  });

  it("looks no higher than the git repository", () => {
    const outer = tree({
      "tsconfig.json": config({}),
      "repo/.git/HEAD": "",
      "repo/tsconfig.json": config({ include: ["src"] }),
      "repo/src/a.ts": "export const a = 1\n",
    });
    expect(findTsconfig(join(outer, "repo/src/a.ts"))).toBe(
      join(outer, "repo/tsconfig.json"),
    );
  });

  it("uses only the nearest tsconfig outside a git repository", () => {
    const root = tree({
      "tsconfig.json": config({}),
      "pkg/tsconfig.json": config({}),
      "pkg/a.ts": "export const a = 1\n",
    });
    expect(findTsconfig(join(root, "pkg/a.ts"))).toBe(
      join(root, "pkg/tsconfig.json"),
    );
  });
});

describe("loadProject", () => {
  it("loads the test-code source files", () => {
    const project = loadProject(findTsconfig(testCodePath("basic", "src/signup.ts")));
    const names = project
      .getSourceFiles()
      .map((f) => f.getBaseName())
      .sort();
    expect(names).toEqual(["app.ts", "signup.ts", "types.ts"]);
  });

  it("resolves real types across files", () => {
    const project = loadProject(findTsconfig(testCodePath("basic", "src/signup.ts")));
    const fn = project.getSourceFileOrThrow("signup.ts").getFunctionOrThrow("validateUser");
    expect(fn.getReturnType().getText()).toContain("ValidUserData");
  });
});

describe("warmProject", () => {
  it("leaves analysis unchanged and keeps the program", () => {
    const { project, root } = loadTestCode("basic");
    warmProject(project);
    const program = project.getProgram().compilerObject;

    const file = testCodePath("basic", "src/signup.ts");
    const offset = readFileSync(file, "utf8").indexOf("const valid");
    const slice = analyzeFocus(project, { file, offset, repoRoot: root });

    const golden = new URL(
      "../__goldens__/basic-handleSignup.json",
      import.meta.url,
    );
    expect(JSON.parse(JSON.stringify(slice))).toEqual(
      JSON.parse(readFileSync(golden, "utf8")),
    );
    expect(project.getProgram().compilerObject).toBe(program);
  });
});
