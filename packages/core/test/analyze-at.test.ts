import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeFocus, analyzeFocusAt } from "../src/analyze.js";
import { loadProject } from "../src/project.js";
import { loadTestCode, testCodePath } from "./helpers.js";

describe("analyzeFocusAt", () => {
  const { project, root } = loadTestCode("basic");
  const file = testCodePath("basic", "src/signup.ts");
  const text = project.getSourceFileOrThrow(file).getFullText();
  const offset = text.indexOf("const valid = validateUser");
  const before = text.slice(0, offset).split("\n");
  const line = before.length - 1;
  const character = before[line]?.length ?? 0;

  it("gives the slice analyzeFocus gives at the equivalent offset", () => {
    expect(
      analyzeFocusAt(project, { file, line, character, repoRoot: root }),
    ).toEqual(analyzeFocus(project, { file, offset, repoRoot: root }));
  });

  it("fails for a file that is not in the project", () => {
    const missing = testCodePath("basic", "src/missing.ts");
    expect(() =>
      analyzeFocusAt(project, {
        file: missing,
        line: 0,
        character: 0,
        repoRoot: root,
      }),
    ).toThrow(`File is not in project: ${missing}`);
  });

  it("rejects a line outside the file with a RangeError", () => {
    expect(() =>
      analyzeFocusAt(project, {
        file,
        line: 999,
        character: 0,
        repoRoot: root,
      }),
    ).toThrow(RangeError);
  });

  it("lands in the function the disk text puts there when line endings are mixed", () => {
    const dir = mkdtempSync(join(tmpdir(), "code-spider-mixed-"));
    try {
      writeFileSync(join(dir, "tsconfig.json"), '{"include":["*.ts"]}\n');
      const mixed = join(dir, "mixed.ts");
      writeFileSync(
        mixed,
        "export function a(): number {\r\n  return 1;\r\n}\n" +
          "export function b(): number {\n  return 2;\n}\r\n" +
          "export function c(): number {\r  return 3;\r}\n",
      );
      const mixedProject = loadProject(join(dir, "tsconfig.json"));
      const focusAt = (line: number) =>
        analyzeFocusAt(mixedProject, {
          file: mixed,
          line,
          character: 3,
          repoRoot: dir,
        }).focusId;

      expect(focusAt(1)).toBe("mixed.ts#a");
      expect(focusAt(4)).toBe("mixed.ts#b");
      expect(focusAt(7)).toBe("mixed.ts#c");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
