import { describe, expect, it } from "vitest";
import { SyntaxKind } from "ts-morph";
import { buildGraphNode, CODE_PREVIEW_MAX_LINES } from "../src/node-builder.js";
import { toFocusTarget } from "../src/focus.js";
import { testCodePath, loadTestCode } from "./helpers.js";

describe("buildGraphNode", () => {
  const { project, root } = loadTestCode("basic");
  const signup = project.getSourceFileOrThrow("signup.ts");
  const ctx = { repoRoot: root };

  it("builds a function node with repo-relative id and file", () => {
    const target = toFocusTarget(
      signup.getFunctionOrThrow("validateUser"),
      signup,
    );
    const node = buildGraphNode(target, "function", ctx);

    expect(node.id).toBe("src/signup.ts#validateUser");
    expect(node.file).toBe("src/signup.ts");
    expect(node.kind).toBe("function");
    expect(node.name).toBe("validateUser");
  });

  it("carries input and return types and the async flag", () => {
    const target = toFocusTarget(signup.getFunctionOrThrow("createUser"), signup);
    const node = buildGraphNode(target, "function", ctx);

    expect(node.inputType).toBe("ValidUserData");
    expect(node.returnType).toBe("User");
    expect(node.isAsync).toBe(true);
  });

  it("records a 1-based declaration range", () => {
    const target = toFocusTarget(
      signup.getFunctionOrThrow("validateUser"),
      signup,
    );
    const node = buildGraphNode(target, "function", ctx);

    expect(node.range.startLine).toBeGreaterThan(0);
    expect(node.range.startColumn).toBe(1);
    expect(node.range.endLine).toBeGreaterThan(node.range.startLine);
  });

  it("uses the variable statement text for arrow-function consts", () => {
    const decl = signup
      .getVariableDeclarationOrThrow("auditSignup")
      .getInitializerIfKindOrThrow(SyntaxKind.ArrowFunction);
    const target = toFocusTarget(decl, signup);
    const node = buildGraphNode(target, "function", ctx);

    expect(node.codePreview).toMatch(/^export const auditSignup/);
  });

  it("caps the excerpt at CODE_PREVIEW_MAX_LINES and reports the pre-clamp count", () => {
    const lines = Array.from({ length: 40 }, (_, i) => `  const x${i} = ${i}`);
    const body = lines.join("\n");
    const long = project.createSourceFile(
      "tmp-long.ts",
      `export function big() {\n${body}\n}`,
    );
    const target = toFocusTarget(long.getFunctionOrThrow("big"), long);
    const node = buildGraphNode(target, "function", {
      repoRoot: testCodePath("basic"),
    });

    expect(node.lineCount).toBe(42);
    const previewLines = node.codePreview.split("\n");
    expect(previewLines).toHaveLength(CODE_PREVIEW_MAX_LINES);
  });
});
