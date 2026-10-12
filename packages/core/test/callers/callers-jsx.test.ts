import { describe, expect, it } from "vitest";
import { collectCalleeEdges } from "../../src/callees/callees.js";
import { collectCallerEdges } from "../../src/callers/callers.js";
import { toFocusTarget } from "../../src/focus/focus.js";
import { MEMORY_ROOT, memoryProject } from "../helpers.js";

const HEADER =
  "export function Header(props: { title: string }): JSX.Element {\n" +
  "  return <div>{props.title}</div>\n" +
  "}\n";
const IMPORT = 'import { Header } from "./header";\n';
const ctx = { repoRoot: MEMORY_ROOT };

function setup(files: Record<string, string>) {
  const project = memoryProject({ "src/header.tsx": HEADER, ...files });
  const targetOf = (rel: string, name: string) => {
    const file = project.getSourceFileOrThrow(`${MEMORY_ROOT}/${rel}`);
    return toFocusTarget(file.getFunctionOrThrow(name), file);
  };
  const callers = collectCallerEdges(
    targetOf("src/header.tsx", "Header"),
    "src/header.tsx#Header",
    ctx,
  );
  return { targetOf, ...callers };
}

describe("collectCallerEdges — JSX renders", () => {
  it("keeps self-closing and open/close renders as jsx edges", () => {
    const { edges } = setup({
      "src/page.tsx":
        IMPORT +
        'export function Page(): JSX.Element { return <div><Header title="a" /></div> }\n' +
        'export const Other = (): JSX.Element => <Header title="b"></Header>\n',
    });
    expect(edges.map((e) => [e.to, e.kind])).toEqual([
      ["src/page.tsx#Page", "jsx"],
      ["src/page.tsx#Other", "jsx"],
    ]);
  });

  it("keeps a namespaced tag such as <UI.Header>", () => {
    const { edges } = setup({
      "src/page.tsx":
        'import * as UI from "./header";\n' +
        'export function Page(): JSX.Element { return <UI.Header title="a" /> }\n',
    });
    expect(edges.map((e) => e.to)).toEqual(["src/page.tsx#Page"]);
  });

  it("matches the edge the parent's own slice produces", () => {
    const { edges, targetOf } = setup({
      "src/page.tsx":
        IMPORT +
        'export function Page(): JSX.Element { return <Header title="a" /> }\n',
    });
    const fromParent = collectCalleeEdges(
      targetOf("src/page.tsx", "Page"),
      "src/page.tsx#Page",
      ctx,
    ).edges.find((e) => e.kind === "jsx");
    expect(edges).toEqual([fromParent]);
  });

  it("keeps both a call and a render from the same parent", () => {
    const { edges } = setup({
      "src/page.tsx":
        IMPORT +
        "export function Page(): JSX.Element {\n" +
        '  Header({ title: "x" })\n' +
        '  return <Header title="a" />\n' +
        "}\n",
    });
    expect(edges.map((e) => e.id)).toEqual([
      "src/header.tsx#Header->src/page.tsx#Page",
      "src/header.tsx#Header->src/page.tsx#Page#jsx",
    ]);
  });
});
