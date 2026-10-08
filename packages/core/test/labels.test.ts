import { describe, expect, it } from "vitest";
import { inputTypeLabel, returnTypeLabel } from "../src/labels.js";
import { MEMORY_ROOT, loadTestCode, memoryProject } from "./helpers.js";

describe("returnTypeLabel", () => {
  const { project } = loadTestCode("basic");
  const signup = project.getSourceFileOrThrow("signup.ts");

  it("reads a plain return type", () => {
    const label = returnTypeLabel(signup.getFunctionOrThrow("validateUser"));
    expect(label).toEqual({ text: "ValidUserData", isAsync: false });
  });

  it("unwraps Promise<User> to User and flags async", () => {
    const label = returnTypeLabel(signup.getFunctionOrThrow("createUser"));
    expect(label).toEqual({ text: "User", isAsync: true });
  });

  it("unwraps Promise<void> to void", () => {
    const label = returnTypeLabel(signup.getFunctionOrThrow("sendWelcome"));
    expect(label).toEqual({ text: "void", isAsync: true });
  });

  it("does not unwrap a repo type that is merely named Promise", () => {
    const file = memoryProject({
      "src/own.ts": [
        "class Promise<T> { constructor(readonly value: T) {} }",
        "export function own(): Promise<number> { return new Promise(1) }",
        "",
      ].join("\n"),
    }).getSourceFileOrThrow(`${MEMORY_ROOT}/src/own.ts`);
    const label = returnTypeLabel(file.getFunctionOrThrow("own"));
    expect(label).toEqual({ text: "Promise<number>", isAsync: false });
  });
});

describe("inputTypeLabel", () => {
  const { project } = loadTestCode("basic");
  const signup = project.getSourceFileOrThrow("signup.ts");

  it("reads a single parameter type", () => {
    expect(inputTypeLabel(signup.getFunctionOrThrow("validateUser"))).toBe(
      "UserInput",
    );
  });

  it("returns an empty string when there are no parameters", () => {
    const noArgs = project.createSourceFile(
      "tmp-noargs.ts",
      "export function f() { return 1 }",
    );
    expect(inputTypeLabel(noArgs.getFunctionOrThrow("f"))).toBe("");
  });

  it("comma-joins multiple parameter types", () => {
    const multi = project.createSourceFile(
      "tmp-multi.ts",
      "export function g(a: string, b: number) { return a + b }",
    );
    expect(inputTypeLabel(multi.getFunctionOrThrow("g"))).toBe(
      "string, number",
    );
  });
});
