import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { loadTestCode, memoryProject, MEMORY_ROOT } from "./helpers.js";

describe("expandNode", () => {
  const { project, root } = loadTestCode("basic");

  it("produces a slice focused on the named node", () => {
    const slice = expandNode(project, "src/signup.ts#createUser", root);
    expect(slice.focusId).toBe("src/signup.ts#createUser");
  });

  it("finds the expanded node's own caller", () => {
    const slice = expandNode(project, "src/signup.ts#createUser", root);
    expect(
      slice.edges.some((e) => e.to === "src/signup.ts#handleSignup"),
    ).toBe(true);
  });

  it("agrees with analyzeFocus for the same declaration", () => {
    const viaExpand = expandNode(project, "src/signup.ts#handleSignup", root);
    const offset = project
      .getSourceFileOrThrow("signup.ts")
      .getFullText()
      .indexOf("const valid = validateUser");
    const viaFocus = analyzeFocus(project, {
      file: project.getSourceFileOrThrow("signup.ts").getFilePath(),
      offset,
      repoRoot: root,
    });

    expect(viaExpand).toEqual(viaFocus);
    expect(viaExpand.nodes.map((n) => n.id)).toEqual([
      "src/app.ts#main",
      "src/app.ts#retry",
      "src/signup.ts#createUser",
      "src/signup.ts#handleSignup",
      "src/signup.ts#sendWelcome",
      "src/signup.ts#validateUser",
    ]);
  });

  it("refuses to expand an external node", () => {
    expect(() =>
      expandNode(project, "external:tiny-lib#persist", root),
    ).toThrow(/not expandable/);
  });

  it("refuses to expand an unknown node", () => {
    expect(() => expandNode(project, "unknown#handlers[key]", root)).toThrow(
      /not expandable/,
    );
  });

  it("throws for a node that no longer exists", () => {
    expect(() => expandNode(project, "src/signup.ts#deleted", root)).toThrow(
      /not found/,
    );
  });

  it("throws for a node whose file is no longer in the project", () => {
    expect(() => expandNode(project, "src/gone.ts#createUser", root)).toThrow(
      /not found/,
    );
  });

  it("expands an arrow-function const", () => {
    const slice = expandNode(project, "src/signup.ts#auditSignup", root);

    expect(slice.focusId).toBe("src/signup.ts#auditSignup");
    expect(slice.nodes.find((n) => n.id === slice.focusId)).toMatchObject({
      kind: "function",
      name: "auditSignup",
      isAsync: true,
    });
  });

  it("throws for an index with no matching declaration", () => {
    expect(() =>
      expandNode(project, "src/signup.ts#createUser~1", root),
    ).toThrow(/not found/);
  });
});

describe("expandNode — class methods", () => {
  const project = memoryProject({
    "src/repo.ts": [
      "export class Repo {",
      "  save(id: string): boolean {",
      "    return this.write(id)",
      "  }",
      "  private write(id: string): boolean {",
      "    return id.length > 0",
      "  }",
      "}",
      "export function persistAll(repo: Repo): void {",
      "  repo.save('a')",
      "}",
      "",
    ].join("\n"),
  });

  it("expands a method by name", () => {
    const slice = expandNode(project, "src/repo.ts#save", MEMORY_ROOT);

    expect(slice.focusId).toBe("src/repo.ts#save");
    expect(slice.nodes.find((n) => n.id === slice.focusId)?.name).toBe("save");
  });

  it("includes a method's callees and callers", () => {
    const slice = expandNode(project, "src/repo.ts#save", MEMORY_ROOT);

    expect(slice.nodes.map((n) => n.id)).toContain("src/repo.ts#write");
    expect(
      slice.edges.some((e) => e.to === "src/repo.ts#persistAll"),
    ).toBe(true);
  });

  it("does not expand a class name", () => {
    expect(() => expandNode(project, "src/repo.ts#Repo", MEMORY_ROOT)).toThrow(
      /not found/,
    );
  });

  it("picks the Nth same-named method for a ~index", () => {
    const twins = memoryProject({
      "src/twins.ts": [
        "export class A {",
        "  run(): number {",
        "    return 1",
        "  }",
        "}",
        "export class B {",
        "  run(): string {",
        "    return 'b'",
        "  }",
        "}",
        "",
      ].join("\n"),
    });
    const second = expandNode(twins, "src/twins.ts#run~1", MEMORY_ROOT);

    expect(second.focusId).toBe("src/twins.ts#run");
    expect(second.nodes.find((n) => n.id === second.focusId)?.returnType).toBe(
      "string",
    );
  });

  it("does not expand a plain variable", () => {
    const withConst = memoryProject({
      "src/limits.ts": "export const LIMIT = 3\n",
    });
    expect(() =>
      expandNode(withConst, "src/limits.ts#LIMIT", MEMORY_ROOT),
    ).toThrow(/not found/);
  });
});
