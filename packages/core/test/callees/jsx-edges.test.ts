import { describe, expect, it } from "vitest";
import { classifyDeclaration } from "../../src/nodes/classify.js";
import { MEMORY_ROOT, collectMemoryPage, memoryProject } from "../helpers.js";

const component = (name: string, props: string, body: string) =>
  `export function ${name}(${props}): JSX.Element {\n  return ${body}\n}\n`;

const pageWith = (imports: string, jsx: string) => ({
  "src/page.tsx": `${imports}\n${component("Page", "", jsx)}`,
});

const jsxEdgesFrom = (edges: { from: string; kind: string }[], from: string) =>
  edges.filter((e) => e.from === from && e.kind === "jsx");

describe("JSX edge cases", () => {
  it("records an unresolvable tag as an unknown jsx edge", () => {
    const { nodes, edges } = collectMemoryPage(pageWith("", "<Missing />"));
    expect(nodes.find((n) => n.id === "unknown:src/page.tsx#Page#Missing")?.kind).toBe("unknown");
    const edge = edges.find((e) => e.from === "unknown:src/page.tsx#Page#Missing");
    expect(edge).toMatchObject({
      kind: "jsx",
      resolved: false,
      to: "src/page.tsx#Page",
    });
  });

  it("captures a wrapper and its nested child once each", () => {
    const files = {
      "src/wrap.tsx": component(
        "Wrapper",
        "props: { children: JSX.Element }",
        "<div>{props.children}</div>",
      ),
      "src/child.tsx": component("Child", "", "<div />"),
      ...pageWith(
        `import { Wrapper } from "./wrap";\nimport { Child } from "./child";`,
        "<Wrapper><Child /></Wrapper>",
      ),
    };
    const { edges } = collectMemoryPage(files);
    expect(jsxEdgesFrom(edges, "src/wrap.tsx#Wrapper")).toHaveLength(1);
    expect(jsxEdgesFrom(edges, "src/child.tsx#Child")).toHaveLength(1);
  });

  it("dedupes a component rendered several times", () => {
    const files = {
      "src/child.tsx": component("Child", "", "<div />"),
      ...pageWith(
        `import { Child } from "./child";`,
        "<div><Child /><Child></Child></div>",
      ),
    };
    const { edges } = collectMemoryPage(files);
    expect(jsxEdgesFrom(edges, "src/child.tsx#Child")).toHaveLength(1);
  });

  it("resolves an anonymous default-export component as default", () => {
    const files = {
      "src/anon.tsx":
        "export default function (props: { a: number }): JSX.Element {\n  return <div>{props.a}</div>\n}\n",
      ...pageWith(`import Anon from "./anon";`, "<Anon a={1} />"),
    };
    const { nodes, edges } = collectMemoryPage(files);
    expect(nodes.find((n) => n.id === "src/anon.tsx#default")).toMatchObject({
      kind: "component",
      name: "default",
    });
    expect(edges.find((e) => e.from === "src/anon.tsx#default")).toMatchObject({
      kind: "jsx",
      resolved: true,
      supplies: "{ a: number; }",
    });
  });

  it("resolves a namespace member tag such as <ns.Bar />", () => {
    const files = {
      "src/ns.tsx": component("Bar", "props: { q: number }", "<div />"),
      ...pageWith(`import * as ns from "./ns";`, "<ns.Bar q={1} />"),
    };
    const { nodes, edges } = collectMemoryPage(files);
    expect(nodes.find((n) => n.id === "src/ns.tsx#Bar")?.kind).toBe(
      "component",
    );
    expect(jsxEdgesFrom(edges, "src/ns.tsx#Bar")).toHaveLength(1);
  });

  it("treats a namespaced intrinsic tag such as <svg:rect /> as intrinsic", () => {
    const { nodes, edges } = collectMemoryPage(pageWith("", "<svg:rect />"));
    expect(nodes.some((n) => n.id.includes("svg"))).toBe(false);
    expect(edges.some((e) => e.from.includes("svg"))).toBe(false);
  });

  it("gives a rendered component the kind it has as a focus", () => {
    const files = {
      "src/maybe.tsx": `export function Maybe(): string | null {\n  return null\n}\n`,
      "src/odd.tsx": `export function Odd(): { a: number } {\n  return { a: 1 }\n}\n`,
      ...pageWith(
        `import { Maybe } from "./maybe";\nimport { Odd } from "./odd";`,
        "<div><Maybe /><Odd /></div>",
      ),
    };
    const project = memoryProject(files);
    const { nodes } = collectMemoryPage(files);
    for (const [rel, name] of [
      ["src/maybe.tsx", "Maybe"],
      ["src/odd.tsx", "Odd"],
    ] as const) {
      const file = project.getSourceFileOrThrow(`${MEMORY_ROOT}/${rel}`);
      const focusKind = classifyDeclaration(file.getFunctionOrThrow(name));
      expect(nodes.find((n) => n.id === `${rel}#${name}`)?.kind).toBe(
        focusKind,
      );
    }
  });
});
