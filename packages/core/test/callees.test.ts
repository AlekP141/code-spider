import { describe, expect, it } from "vitest";
import { collectCalleeEdges } from "../src/callees.js";
import { toFocusTarget } from "../src/focus.js";
import { collectMemoryPage, loadTestCode } from "./helpers.js";

describe("collectCalleeEdges", () => {
  const { project, root } = loadTestCode("basic");
  const signup = project.getSourceFileOrThrow("signup.ts");
  const ctx = { repoRoot: root };
  const focusId = "src/signup.ts#handleSignup";
  const target = toFocusTarget(
    signup.getFunctionOrThrow("handleSignup"),
    signup,
  );
  const { nodes, edges } = collectCalleeEdges(target, focusId, ctx);

  it("finds every repo callee", () => {
    const ids = edges.map((e) => e.from).sort();
    expect(ids).toEqual([
      "src/signup.ts#createUser",
      "src/signup.ts#sendWelcome",
      "src/signup.ts#validateUser",
    ]);
  });

  it("points every edge at the focus node", () => {
    expect(edges.every((e) => e.to === focusId)).toBe(true);
  });

  it("labels edges with the callee return type, promise-unwrapped", () => {
    const edge = edges.find((e) => e.from === "src/signup.ts#createUser");
    expect(edge?.supplies).toBe("User");
    expect(edge?.kind).toBe("call");
    expect(edge?.resolved).toBe(true);
  });

  it("records a call site range for click-to-jump", () => {
    const edge = edges.find((e) => e.from === "src/signup.ts#validateUser");
    expect(edge?.callSite.startLine).toBeGreaterThan(0);
  });

  it("emits one node per callee", () => {
    expect(nodes.map((n) => n.id).sort()).toEqual([
      "src/signup.ts#createUser",
      "src/signup.ts#sendWelcome",
      "src/signup.ts#validateUser",
    ]);
  });
});

describe("collectCalleeEdges — externals", () => {
  const { project, root } = loadTestCode("externals");
  const uses = project.getSourceFileOrThrow("uses.ts");
  const ctx = { repoRoot: root };
  const focusId = "src/uses.ts#usesExternals";
  const target = toFocusTarget(
    uses.getFunctionOrThrow("usesExternals"),
    uses,
  );
  const { nodes, edges } = collectCalleeEdges(target, focusId, ctx);

  it("classifies a node_modules call as an external chip", () => {
    const node = nodes.find((n) => n.id === "external:tiny-lib#persist");
    expect(node?.kind).toBe("external");
    expect(node?.file).toBe("");
  });

  it("classifies a lib builtin call as external", () => {
    expect(nodes.some((n) => n.id === "external:lib#console.log")).toBe(true);
  });

  it("marks external edges with kind external", () => {
    const edge = edges.find((e) => e.from === "external:tiny-lib#persist");
    expect(edge?.kind).toBe("external");
  });

  it("still finds the repo callee alongside the externals", () => {
    expect(edges.some((e) => e.from === "src/uses.ts#local")).toBe(true);
  });
});

describe("collectCalleeEdges — unresolved", () => {
  const { project, root } = loadTestCode("basic");
  const dynamic = project.createSourceFile(
    "tmp-dynamic.ts",
    `const handlers: Record<string, (x: number) => number> = {}
     export function dispatch(key: string) { return handlers[key]!(1) }`,
  );
  const target = toFocusTarget(dynamic.getFunctionOrThrow("dispatch"), dynamic);
  const { nodes, edges } = collectCalleeEdges(
    target,
    "tmp-dynamic.ts#dispatch",
    { repoRoot: root },
  );

  it("keeps an unresolved call as an unknown node", () => {
    expect(nodes.some((n) => n.kind === "unknown")).toBe(true);
    expect(edges.some((e) => e.resolved === false)).toBe(true);
  });
});

describe("collectCalleeEdges — deduplication", () => {
  const { project, root } = loadTestCode("basic");
  const dupes = project.createSourceFile(
    "tmp-dupes.ts",
    `function helper(n: number): number { return n }
     export function twice(n: number): number { return helper(n) + helper(n) }`,
  );
  const target = toFocusTarget(dupes.getFunctionOrThrow("twice"), dupes);
  const { edges } = collectCalleeEdges(target, "tmp-dupes.ts#twice", {
    repoRoot: root,
  });

  it("emits one edge for a callee invoked twice", () => {
    expect(edges.filter((e) => e.from.endsWith("#helper"))).toHaveLength(1);
  });
});

describe("collectCalleeEdges — unnameable callees", () => {
  const { project, root } = loadTestCode("basic");

  it("resolves a call to an anonymous default export as default", () => {
    project.createSourceFile(
      "tmp-anon-default.ts",
      `export default function () { return 1 }`,
    );
    const caller = project.createSourceFile(
      "tmp-anon-caller.ts",
      `import d from "./tmp-anon-default";
       export function usesAnon() { return d() }`,
    );
    const target = toFocusTarget(
      caller.getFunctionOrThrow("usesAnon"),
      caller,
    );

    const { nodes, edges } = collectCalleeEdges(
      target,
      "tmp-anon-caller.ts#usesAnon",
      { repoRoot: root },
    );

    const callee = nodes.find((n) => n.name === "default");
    expect(callee?.id).toMatch(/tmp-anon-default\.ts#default$/);
    expect(edges.find((e) => e.from === callee?.id)?.resolved).toBe(true);
  });

  it("keeps a call to a private-name method as unresolved", () => {
    const klass = project.createSourceFile(
      "tmp-private.ts",
      `export class Box {
         #secret(): number { return 1 }
         run(): number { return this.#secret() }
       }`,
    );
    const target = toFocusTarget(
      klass.getClassOrThrow("Box").getMethodOrThrow("run"),
      klass,
    );

    const { nodes, edges } = collectCalleeEdges(
      target,
      "tmp-private.ts#run",
      { repoRoot: root },
    );

    expect(nodes.some((n) => n.kind === "unknown")).toBe(true);
    expect(edges.some((e) => e.resolved === false)).toBe(true);
  });
});

describe("collectCalleeEdges — call text as a name", () => {
  const { nodes } = collectMemoryPage({
    "src/page.tsx": [
      "declare const api: any",
      "export function Page(xs: string[]): void {",
      "  api",
      "    .users",
      "    ?.list()",
      "  xs",
      '    .join(",")',
      "  ;(function () {",
      "    return 'a long immediately invoked function body that goes on'",
      "  })()",
      "}",
      "",
    ].join("\n"),
  });
  const ids = nodes.map((n) => n.id);

  it("drops line breaks and indentation around member access", () => {
    expect(ids).toContain("unknown:src/page.tsx#Page#api.users?.list");
    expect(ids).toContain("external:lib#xs.join");
  });

  it("collapses and caps a long callee expression", () => {
    const iife = nodes.find((n) => n.id.startsWith("unknown:src/page.tsx#Page#(function"));
    expect(iife?.name).toMatch(/^\(function \(\) \{ return .*…$/);
    expect(iife?.name.length).toBeLessThanOrEqual(60);
  });
});

describe("collectCalleeEdges — overloaded callees", () => {
  it("shows the implementation, not the first overload signature", () => {
    const { nodes } = collectMemoryPage({
      "src/fmt.ts": [
        "export function fmt(a: number): string;",
        "export function fmt(a: string): string;",
        "export function fmt(a: unknown): string {",
        "  return String(a)",
        "}",
        "",
      ].join("\n"),
      "src/page.tsx": [
        'import { fmt } from "./fmt";',
        "export function Page(): string {",
        "  return fmt(1)",
        "}",
        "",
      ].join("\n"),
    });
    const fmt = nodes.find((n) => n.id === "src/fmt.ts#fmt");
    expect(fmt?.range.startLine).toBe(3);
    expect(fmt?.codePreview).toMatch(/^export function fmt\(a: unknown\)/);
    expect(fmt?.inputType).toBe("unknown");
  });
});
