import { describe, expect, it } from "vitest";
import { collectMemoryPage } from "./helpers.js";

const component = (name: string, body: string) =>
  `export function ${name}(): JSX.Element {\n  return ${body}\n}\n`;

describe("first call site in source order", () => {
  it("keeps the site of a new that comes before a call to the same function", () => {
    const { edges } = collectMemoryPage({
      "src/page.tsx": [
        "function Legacy() {}",
        "export function Page() {",
        "  new Legacy();",
        "  Legacy();",
        "}",
      ].join("\n"),
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      kind: "call",
      from: "src/page.tsx#Legacy",
    });
    expect(edges[0]?.callSite.startLine).toBe(3);
  });

  it("keeps the site of an opening tag that comes before a self-closing tag of the same component", () => {
    const { edges } = collectMemoryPage({
      "src/box.tsx": component("Box", "<div />"),
      "src/page.tsx": [
        `import { Box } from "./box";`,
        "export function Page(): JSX.Element {",
        "  return (",
        "    <div>",
        "      <Box></Box>",
        "      <Box />",
        "    </div>",
        "  );",
        "}",
      ].join("\n"),
    });
    const jsx = edges.filter((e) => e.kind === "jsx");
    expect(jsx).toHaveLength(1);
    expect(jsx[0]?.callSite.startLine).toBe(5);
  });
});
