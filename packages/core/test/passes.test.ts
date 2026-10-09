import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const project = memoryProject({
  "src/util.ts": [
    "export function cn(x: string): string { return x }",
    "export function save(x: string): void {}",
    "export function format(n: number): string { return String(n) }",
    "export function track(x: string): void {}",
    "export function load(): void {}",
    "export function ping(): void {}",
    "",
  ].join("\n"),
  "src/page.tsx": [
    'import { cn, save, format, track, load, ping } from "./util";',
    "export { format }",
    "declare function useEffect(fn: () => void): void",
    "type Formatter = typeof format",
    "export function Shell(): JSX.Element {",
    "  const onClick = () => save(cn('a'))",
    "  const labels = [1].map(format)",
    "  useEffect(load)",
    "  const config = { handler: track }",
    "  const short = { ping }",
    "  return <div onClick={onClick} onBlur={save.bind(null, 'x')} />",
    "}",
    "",
  ].join("\n"),
});

function sliceAt(rel: string, needle: string) {
  const file = `${MEMORY_ROOT}/${rel}`;
  const text = project.getSourceFileOrThrow(file).getFullText();
  const offset = text.indexOf(needle);
  if (offset === -1) throw new Error(`needle not found: ${needle}`);
  return analyzeFocus(project, { file, offset, repoRoot: MEMORY_ROOT });
}

const shell = sliceAt("src/page.tsx", "useEffect(load)");
const into = (id: string) =>
  shell.edges.filter((e) => e.to === id).map((e) => [e.from, e.kind]);

describe("functions passed as values", () => {
  it("connects every function the focus passes, as passes edges", () => {
    expect(into("src/page.tsx#Shell")).toEqual(
      expect.arrayContaining([
        ["src/page.tsx#Shell.onClick", "passes"],
        ["src/util.ts#format", "passes"],
        ["src/util.ts#load", "passes"],
        ["src/util.ts#track", "passes"],
        ["src/util.ts#save", "passes"],
        ["src/util.ts#ping", "passes"],
      ]),
    );
  });

  it("does not credit the focus with calls its nested functions make", () => {
    const called = shell.edges.filter(
      (e) => e.kind === "call" && e.to === "src/page.tsx#Shell",
    );
    expect(called.map((e) => e.from)).not.toContain("src/util.ts#cn");
  });

  it("labels a passes edge with the passed function's signature", () => {
    const edge = shell.edges.find((e) => e.from === "src/util.ts#format");
    expect(edge?.supplies).toBe("(n: number) => string");
  });

  it("finds the passer from the passed function's side", () => {
    const format = sliceAt("src/util.ts", "return String(n)");
    const out = format.edges.filter((e) => e.from === format.focusId);
    expect(out.map((e) => [e.to, e.kind])).toEqual([
      ["src/page.tsx#Shell", "passes"],
    ]);
  });

  it("gives both sides the same edge", () => {
    const fromFormat = sliceAt("src/util.ts", "return String(n)").edges.filter(
      (e) => e.from === "src/util.ts#format",
    );
    const fromShell = shell.edges.filter(
      (e) => e.from === "src/util.ts#format",
    );
    expect(fromFormat).toEqual(fromShell);
  });

  it("keeps a nested handler's own calls on the handler", () => {
    const onClick = sliceAt("src/page.tsx", "save(cn('a'))");
    expect(onClick.focusId).toBe("src/page.tsx#Shell.onClick");
    expect(onClick.edges.map((e) => [e.from, e.to, e.kind])).toEqual(
      expect.arrayContaining([
        ["src/util.ts#cn", "src/page.tsx#Shell.onClick", "call"],
        ["src/page.tsx#Shell.onClick", "src/page.tsx#Shell", "passes"],
      ]),
    );
    const cn = sliceAt("src/util.ts", "return x");
    expect(cn.edges.map((e) => e.to)).toEqual(["src/page.tsx#Shell.onClick"]);
  });
});
