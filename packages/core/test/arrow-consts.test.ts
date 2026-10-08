import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectCalleeEdges } from "../src/callees.js";
import { toFocusTarget } from "../src/focus.js";
import { collectMemoryPage, loadTestCode } from "./helpers.js";

describe("arrow-const callees — real fixture", () => {
  const { project, root } = loadTestCode("basic");
  const caller = project.createSourceFile(
    join(root, "src/tmp-arrow-caller.ts"),
    `import { auditSignup } from "./signup";
     import type { User } from "./types";
     export async function runAudit(user: User): Promise<void> {
       await auditSignup(user);
     }`,
  );
  const target = toFocusTarget(caller.getFunctionOrThrow("runAudit"), caller);
  const { nodes, edges } = collectCalleeEdges(
    target,
    "src/tmp-arrow-caller.ts#runAudit",
    { repoRoot: root },
  );

  it("resolves the arrow-const callee to a named function node", () => {
    const node = nodes.find((n) => n.id === "src/signup.ts#auditSignup");
    expect(node).toMatchObject({
      kind: "function",
      name: "auditSignup",
      file: "src/signup.ts",
      inputType: "User",
      returnType: "void",
      isAsync: true,
    });
  });

  it("points the node range and preview at the variable statement", () => {
    const node = nodes.find((n) => n.id === "src/signup.ts#auditSignup");
    expect(node?.codePreview.startsWith("export const auditSignup")).toBe(true);
    expect(node?.range.startLine).toBe(23);
    expect(node?.range.endLine).toBe(25);
  });

  it("labels the call edge with the promise-unwrapped return type", () => {
    const edge = edges.find((e) => e.from === "src/signup.ts#auditSignup");
    expect(edge).toMatchObject({
      kind: "call",
      supplies: "void",
      resolved: true,
      to: "src/tmp-arrow-caller.ts#runAudit",
    });
  });
});

describe("arrow-const and function-expression callees", () => {
  const files = {
    "src/helpers.ts": [
      "export const helper = (n: number): string => String(n)",
      "export const legacy = function (n: number): number {",
      "  return n",
      "}",
      "",
    ].join("\n"),
    "src/page.tsx": [
      `import { helper, legacy } from "./helpers";`,
      "export function Page(): string {",
      "  return helper(legacy(1))",
      "}",
      "",
    ].join("\n"),
  };
  const { nodes, edges } = collectMemoryPage(files);

  it("resolves a typed arrow-const callee", () => {
    expect(nodes.find((n) => n.id === "src/helpers.ts#helper")).toMatchObject(
      {
        kind: "function",
        inputType: "number",
        returnType: "string",
        isAsync: false,
      },
    );
  });

  it("resolves a function-expression const named after its variable", () => {
    const node = nodes.find((n) => n.id === "src/helpers.ts#legacy");
    expect(node).toMatchObject({
      kind: "function",
      name: "legacy",
      returnType: "number",
    });
    expect(node?.codePreview.startsWith("export const legacy")).toBe(true);
  });

  it("emits resolved call edges for both consts", () => {
    expect(edges.find((e) => e.from === "src/helpers.ts#helper")).toMatchObject(
      { kind: "call", supplies: "string", resolved: true },
    );
    expect(edges.find((e) => e.from === "src/helpers.ts#legacy")).toMatchObject(
      { kind: "call", supplies: "number", resolved: true },
    );
  });
});

describe("arrow-const with a type annotation", () => {
  const { nodes, edges } = collectMemoryPage({
    "src/handler.ts": [
      "type Handler = (n: number) => number;",
      "export const typed: Handler = (n) => n + 1;",
      "",
    ].join("\n"),
    "src/page.tsx": [
      `import { typed } from "./handler";`,
      "export function Page(): number {",
      "  return typed(1)",
      "}",
      "",
    ].join("\n"),
  });

  it("resolves an annotated arrow const as a function node", () => {
    expect(nodes.find((n) => n.id === "src/handler.ts#typed")).toMatchObject({
      kind: "function",
      name: "typed",
      returnType: "number",
    });
    expect(edges.find((e) => e.from === "src/handler.ts#typed")).toMatchObject(
      { kind: "call", resolved: true },
    );
  });
});

describe("arrow-const JSX components", () => {
  const files = {
    "src/badge.tsx": [
      "export type BadgeProps = { label: string }",
      "export const Badge = (props: BadgeProps): JSX.Element =>",
      "  <span>{props.label}</span>",
      "",
    ].join("\n"),
    "src/page.tsx": [
      `import { Badge } from "./badge";`,
      "export function Page(): JSX.Element {",
      '  return <Badge label="new" />',
      "}",
      "",
    ].join("\n"),
  };
  const { nodes, edges } = collectMemoryPage(files);

  it("resolves an arrow-const component as a component node", () => {
    expect(nodes.find((n) => n.id === "src/badge.tsx#Badge")).toMatchObject({
      kind: "component",
      name: "Badge",
      inputType: "BadgeProps",
    });
  });

  it("labels the JSX edge with the props type", () => {
    expect(
      edges.find((e) => e.from === "src/badge.tsx#Badge"),
    ).toMatchObject({
      kind: "jsx",
      supplies: "BadgeProps",
      resolved: true,
      to: "src/page.tsx#Page",
    });
  });
});

describe("arrow-const externals and unknown initializers", () => {
  it("keeps a declare const from node_modules external", () => {
    const { nodes, edges } = collectMemoryPage({
      "node_modules/ext-lib/index.d.ts": [
        "export declare const persist: (value: string) => Promise<void>;",
        "export declare const Chip: (props: { text: string }) => JSX.Element;",
        "",
      ].join("\n"),
      "src/page.tsx": [
        `import { persist, Chip } from "ext-lib";`,
        "export function Page(): JSX.Element {",
        '  void persist("x")',
        '  return <Chip text="x" />',
        "}",
        "",
      ].join("\n"),
    });
    expect(nodes.find((n) => n.id === "external:ext-lib#persist")?.kind).toBe(
      "external",
    );
    expect(nodes.find((n) => n.id === "external:ext-lib#Chip")?.kind).toBe(
      "external",
    );
    expect(
      edges.find((e) => e.from === "external:ext-lib#persist"),
    ).toMatchObject({ kind: "external", resolved: true });
    expect(edges.find((e) => e.from === "external:ext-lib#Chip")).toMatchObject(
      { kind: "jsx", resolved: true },
    );
  });

  it("resolves a const bound through a wrapper call", () => {
    const { nodes, edges } = collectMemoryPage({
      "src/page.tsx": [
        "declare function useCallback<T>(fn: T, deps: unknown[]): T;",
        "const memoised = useCallback(() => 1, []);",
        "export function Page(): number {",
        "  return memoised()",
        "}",
        "",
      ].join("\n"),
    });
    expect(nodes.find((n) => n.id === "src/page.tsx#memoised")?.kind).toBe(
      "function",
    );
    expect(
      edges.find((e) => e.from === "src/page.tsx#memoised"),
    ).toMatchObject({ kind: "call", resolved: true });
  });

  it("keeps a const returned by a call without a function argument as unknown", () => {
    const { nodes, edges } = collectMemoryPage({
      "src/page.tsx": [
        "declare function make(): () => number;",
        "const made = make();",
        "export function Page(): number {",
        "  return made()",
        "}",
        "",
      ].join("\n"),
    });
    expect(nodes.find((n) => n.id === "unknown#made")?.kind).toBe("unknown");
    expect(edges.find((e) => e.from === "unknown#made")).toMatchObject({
      kind: "call",
      resolved: false,
    });
  });
});
