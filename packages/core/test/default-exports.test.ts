import { describe, expect, it } from "vitest";
import { analyzeFocus, expandNode } from "../src/analyze.js";
import { MEMORY_ROOT, memoryProject } from "./helpers.js";

const project = memoryProject({
  "src/memo.ts":
    "export function memo<P>(c: (p: P) => JSX.Element): (p: P) => JSX.Element { return c }\n",
  "src/arrow.tsx": [
    "export const label = 'top'",
    "export default (props: { a: number }) => {",
    "  const onClick = () => props.a",
    "  return <div onClick={onClick} />",
    "}",
    "",
  ].join("\n"),
  "src/fn.tsx":
    "export default function (props: { b: number }) {\n  return <div />\n}\n",
  "src/wrapped.tsx": [
    'import { memo } from "./memo";',
    "export default memo((props: { c: number }) => <div />)",
    "",
  ].join("\n"),
  "src/page.tsx": [
    'import Arrow from "./arrow";',
    'import Fn from "./fn";',
    'import Wrapped from "./wrapped";',
    "export function Page() {",
    "  return <div><Arrow a={1} /><Fn b={2} /><Wrapped c={3} /></div>",
    "}",
    "export function Again() {",
    "  return <Arrow a={2} />",
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

describe("anonymous default exports", () => {
  it("focuses an arrow default export as default", () => {
    const slice = sliceAt("src/arrow.tsx", "return <div");
    expect(slice.focusId).toBe("src/arrow.tsx#default");
    const focus = slice.nodes.find((n) => n.id === slice.focusId);
    expect(focus?.name).toBe("default");
    expect(focus?.codePreview).toMatch(/^export default \(props/);
  });

  it("focuses an unnamed default function and a wrapped arrow", () => {
    expect(sliceAt("src/fn.tsx", "return <div").focusId).toBe(
      "src/fn.tsx#default",
    );
    expect(sliceAt("src/wrapped.tsx", "<div />").focusId).toBe(
      "src/wrapped.tsx#default",
    );
  });

  it("falls back to an anonymous default export outside any function", () => {
    expect(sliceAt("src/arrow.tsx", "label").focusId).toBe(
      "src/arrow.tsx#default",
    );
  });

  it("finds the components that render it", () => {
    const callers = sliceAt("src/arrow.tsx", "return <div").edges.filter(
      (e) => e.from === "src/arrow.tsx#default",
    );
    expect(callers.map((e) => [e.to, e.kind])).toEqual([
      ["src/page.tsx#Again", "jsx"],
      ["src/page.tsx#Page", "jsx"],
    ]);
  });

  it("resolves where it is rendered", () => {
    const page = sliceAt("src/page.tsx", "return <div><Arrow");
    expect(page.edges.map((e) => e.from)).toEqual([
      "src/arrow.tsx#default",
      "src/fn.tsx#default",
      "src/wrapped.tsx#default",
    ]);
  });

  it("names functions nested inside it and expands both", () => {
    const slice = sliceAt("src/arrow.tsx", "props.a");
    expect(slice.focusId).toBe("src/arrow.tsx#default.onClick");
    const ids = ["src/arrow.tsx#default", "src/arrow.tsx#default.onClick"];
    for (const id of ids) {
      expect(expandNode(project, id, MEMORY_ROOT).focusId).toBe(id);
    }
  });
});
