import { describe, expect, it } from "vitest";
import { analyzeFocus } from "../src/analyze.js";
import { edgeId } from "../src/node-id.js";
import { memoryProject, MEMORY_ROOT } from "./helpers.js";

const PAGE = `${MEMORY_ROOT}/src/page.tsx`;

function sliceOf(files: Record<string, string>, needle: string) {
  const project = memoryProject(files);
  const text = project.getSourceFileOrThrow(PAGE).getFullText();
  return analyzeFocus(project, {
    file: PAGE,
    offset: text.indexOf(needle),
    repoRoot: MEMORY_ROOT,
  });
}

const kindsFrom = (
  edges: { from: string; kind: string }[],
  from: string,
): string[] => edges.filter((e) => e.from === from).map((e) => e.kind);

describe("edgeId", () => {
  it("keeps the plain from->to form for call edges", () => {
    expect(edgeId("a.ts#f", "b.ts#g", "call")).toBe("a.ts#f->b.ts#g");
  });

  it("suffixes non-call edges with their kind", () => {
    expect(edgeId("a.ts#f", "b.ts#g", "jsx")).toBe("a.ts#f->b.ts#g#jsx");
    expect(edgeId("a.ts#f", "b.ts#g", "external")).toBe(
      "a.ts#f->b.ts#g#external",
    );
  });
});

describe("analyzeFocus — unique edge ids", () => {
  it("keeps a call and a jsx edge to the same pair distinct", () => {
    const { edges } = sliceOf(
      {
        "src/foo.tsx":
          "export function Foo(): JSX.Element {\n  return <div />\n}\n",
        "src/page.tsx": [
          'import { Foo } from "./foo.js"',
          "export function Page(): JSX.Element {",
          "  const n = Foo()",
          "  return <Foo />",
          "}",
          "",
        ].join("\n"),
      },
      "const n = Foo()",
    );

    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
    expect(kindsFrom(edges, "src/foo.tsx#Foo")).toEqual(["call", "jsx"]);
    expect(edges.map((e) => e.id)).toEqual([
      "src/foo.tsx#Foo->src/page.tsx#Page",
      "src/foo.tsx#Foo->src/page.tsx#Page#jsx",
    ]);
  });

  it("keeps external call and jsx edges to one node distinct", () => {
    const { edges } = sliceOf(
      {
        "node_modules/ext-lib/index.d.ts": [
          "export declare function Link(props: { href: string }): JSX.Element;",
          "",
        ].join("\n"),
        "src/page.tsx": [
          'import { Link } from "ext-lib"',
          "export function Page(): JSX.Element {",
          '  Link({ href: "/y" })',
          '  return <Link href="/x" />',
          "}",
          "",
        ].join("\n"),
      },
      'Link({ href: "/y" })',
    );

    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
    expect(kindsFrom(edges, "external:ext-lib#Link")).toEqual([
      "external",
      "jsx",
    ]);
    expect(edges.map((e) => e.id)).toEqual([
      "external:ext-lib#Link->src/page.tsx#Page#external",
      "external:ext-lib#Link->src/page.tsx#Page#jsx",
    ]);
  });

  it("keeps unresolved call and jsx edges to one placeholder distinct", () => {
    const { edges } = sliceOf(
      {
        "src/page.tsx": [
          "export function Page(): JSX.Element {",
          "  Missing()",
          "  return <Missing />",
          "}",
          "",
        ].join("\n"),
      },
      "Missing()",
    );

    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
    expect(kindsFrom(edges, "unknown#Missing")).toEqual(["call", "jsx"]);
  });
});
