import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const project = memoryProject({
  "src/util.ts": [
    "export function cn(x: string): string { return x }",
    "export function fmt(n: number): string { return String(n) }",
    "export function home(): string { return 'home' }",
    "",
  ].join("\n"),
  "src/app.tsx": "export function App(): JSX.Element { return <div /> }\n",
  "src/main.tsx": [
    'import { App } from "./app";',
    'import { cn, fmt, home } from "./util";',
    "declare const root: { render(el: JSX.Element): void }",
    "export const banner = cn('top')",
    "export const labels = [1].map((n) => fmt(n))",
    "export const routes = [{ path: '/', handler: home }]",
    "root.render(<App />)",
    "",
  ].join("\n"),
});

function callersOf(rel: string, needle: string) {
  const file = `${MEMORY_ROOT}/${rel}`;
  const text = project.getSourceFileOrThrow(file).getFullText();
  const slice = analyzeFocus(project, {
    file,
    offset: text.indexOf(needle),
    repoRoot: MEMORY_ROOT,
  });
  const edges = slice.edges.filter((e) => e.from === slice.focusId);
  return { slice, edges };
}

const MODULE = "src/main.tsx#<module>";

describe("callers at the top level of a file", () => {
  it("attributes a top-level call to the file's module box", () => {
    const { slice, edges } = callersOf("src/util.ts", "return x");
    expect(edges.map((e) => [e.to, e.kind])).toEqual([[MODULE, "call"]]);
    expect(slice.nodes.find((n) => n.id === MODULE)).toMatchObject({
      kind: "module",
      name: "main.tsx",
      file: "src/main.tsx",
    });
  });

  it("includes calls inside top-level callbacks", () => {
    const { edges } = callersOf("src/util.ts", "return String(n)");
    expect(edges.map((e) => e.to)).toEqual([MODULE]);
  });

  it("includes top-level renders and passes", () => {
    expect(callersOf("src/app.tsx", "return <div").edges).toMatchObject([
      { to: MODULE, kind: "jsx" },
    ]);
    expect(callersOf("src/util.ts", "return 'home'").edges).toMatchObject([
      { to: MODULE, kind: "passes" },
    ]);
  });

  it("does not expand a module box", () => {
    expect(() => expandNode(project, MODULE, MEMORY_ROOT)).toThrow(
      /not expandable/,
    );
  });
});
