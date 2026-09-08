import { describe, expect, it } from "vitest";
import { resolveFocus } from "../src/focus.js";
import { testCodePath, loadTestCode } from "./helpers.js";

/** Offset of the first occurrence of `needle` in a fixture file. */
function offsetOf(
  project: ReturnType<typeof loadTestCode>["project"],
  file: string,
  needle: string,
) {
  const text = project.getSourceFileOrThrow(file).getFullText();
  const at = text.indexOf(needle);
  if (at === -1) throw new Error(`needle not found: ${needle}`);
  return at;
}

describe("resolveFocus", () => {
  const { project } = loadTestCode("basic");
  const signup = testCodePath("basic", "src/signup.ts");

  it("resolves a function declaration from a cursor inside its body", () => {
    const offset = offsetOf(project, "signup.ts", "const valid = validateUser");
    expect(resolveFocus(project, signup, offset).name).toBe("handleSignup");
  });

  it("resolves from a cursor on the function name itself", () => {
    const offset = offsetOf(project, "signup.ts", "handleSignup");
    expect(resolveFocus(project, signup, offset).name).toBe("handleSignup");
  });

  it("resolves an arrow-function const via its variable declaration", () => {
    const offset = offsetOf(project, "signup.ts", "audit ${user.id}");
    const target = resolveFocus(project, signup, offset);
    expect(target.name).toBe("auditSignup");
    expect(target.textNode.getText()).toMatch(/^export const auditSignup/);
  });

  it("reports the enclosing source file", () => {
    const offset = offsetOf(project, "signup.ts", "email required");
    expect(resolveFocus(project, signup, offset).sourceFile.getBaseName()).toBe(
      "signup.ts",
    );
  });

  it("throws for a file that is not part of the project", () => {
    expect(() => resolveFocus(project, "/nope/missing.ts", 0)).toThrow(
      /not in project/,
    );
  });

  it("throws when the offset is not inside any callable and there is no default export", () => {
    const offset = offsetOf(project, "signup.ts", "import type");
    expect(() => resolveFocus(project, signup, offset)).toThrow(/No callable/);
  });

  it("falls back to the default export when the cursor is not in a callable", () => {
    const file = project.createSourceFile(
      "tmp-default.ts",
      "export default function entry(): number { return 1 }\n// trailing\n",
    );
    const offset = file.getFullText().indexOf("// trailing");
    expect(resolveFocus(project, file.getFilePath(), offset).name).toBe(
      "entry",
    );
  });

  it("falls back through an export-assignment default", () => {
    const file = project.createSourceFile(
      "tmp-default-assign.ts",
      "function entry2(): number { return 2 }\nexport default entry2\n// trailing\n",
    );
    const offset = file.getFullText().indexOf("// trailing");
    expect(resolveFocus(project, file.getFilePath(), offset).name).toBe(
      "entry2",
    );
  });
});
