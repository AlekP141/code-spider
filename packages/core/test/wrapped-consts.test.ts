import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const REACT = [
  "export function forwardRef<P>(render: (props: P, ref: unknown) => JSX.Element): (props: P) => JSX.Element { return render as never }",
  "export function memo<P>(c: (props: P) => JSX.Element): (props: P) => JSX.Element { return c }",
  "export function useCallback<T>(fn: T, deps: unknown[]): T { return fn }",
  "",
].join("\n");

const PAGE = [
  'import { forwardRef, memo, useCallback } from "./react";',
  'import { cn } from "./util";',
  "export const Button = forwardRef((props: { x: string }, ref) => {",
  "  cn(props.x)",
  "  return <div />",
  "})",
  "export const Card = memo(forwardRef(function Card(props: { y: string }) {",
  "  return <div>{cn(props.y)}</div>",
  "}))",
  "export const asserted = ((n: number) => cn(String(n))) as (n: number) => string",
  "export const checked = ((n: number) => n) satisfies (n: number) => number",
  "export const labels = [1].map((n) => cn(String(n)))",
  "export function Shell(): JSX.Element {",
  '  const onClick = useCallback(() => cn("z"), [])',
  "  onClick()",
  "  asserted(1)",
  "  checked(1)",
  '  return <div><Button x="1" /><Card y="2" /></div>',
  "}",
  "",
].join("\n");

const project = memoryProject({
  "src/react.ts": REACT,
  "src/util.ts": "export function cn(x: string): string { return x }\n",
  "src/page.tsx": PAGE,
});

function sliceAt(rel: string, needle: string) {
  const file = project.getSourceFileOrThrow(`${MEMORY_ROOT}/${rel}`);
  const offset = file.getFullText().indexOf(needle);
  if (offset === -1) throw new Error(`needle not found: ${needle}`);
  return analyzeFocus(project, {
    file: file.getFilePath(),
    offset,
    repoRoot: MEMORY_ROOT,
  });
}

const fromIds = (edges: { from: string }[]) => edges.map((e) => e.from);

describe("consts bound to a wrapped function", () => {
  it("resolves forwardRef, memo and useCallback consts as callees", () => {
    const slice = sliceAt("src/page.tsx", "onClick()");
    expect(fromIds(slice.edges)).toEqual(
      expect.arrayContaining([
        "src/page.tsx#Button",
        "src/page.tsx#Card",
        "src/page.tsx#onClick",
      ]),
    );
    expect(slice.nodes.find((n) => n.id === "src/page.tsx#Card")?.kind).toBe(
      "component",
    );
  });

  it("resolves consts behind `as` and `satisfies`", () => {
    const slice = sliceAt("src/page.tsx", "onClick()");
    expect(fromIds(slice.edges)).toEqual(
      expect.arrayContaining(["src/page.tsx#asserted", "src/page.tsx#checked"]),
    );
  });

  it("finds callers inside wrapped bodies, but not inside a .map callback", () => {
    const slice = sliceAt("src/util.ts", "return x");
    expect(slice.edges.map((e) => e.to)).toEqual([
      "src/page.tsx#Button",
      "src/page.tsx#Card",
      "src/page.tsx#asserted",
      "src/page.tsx#onClick",
    ]);
  });

  it("focuses the const from a cursor inside the wrapped body", () => {
    const slice = sliceAt("src/page.tsx", "cn(props.x)");
    expect(slice.focusId).toBe("src/page.tsx#Button");
    const focus = slice.nodes.find((n) => n.id === slice.focusId);
    expect(focus?.codePreview).toMatch(/^export const Button = forwardRef/);
  });

  it("finds the JSX parents of a wrapped component", () => {
    const slice = sliceAt("src/page.tsx", "cn(props.x)");
    expect(slice.edges.filter((e) => e.kind === "jsx")).toMatchObject([
      { from: "src/page.tsx#Button", to: "src/page.tsx#Shell" },
    ]);
  });

  it("expands a wrapped const by its name", () => {
    const slice = expandNode(project, "src/page.tsx#Card", MEMORY_ROOT);
    expect(slice.focusId).toBe("src/page.tsx#Card");
  });
});
