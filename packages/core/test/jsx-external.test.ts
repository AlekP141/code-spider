import { describe, expect, it } from "vitest";
import { collectMemoryPage } from "./helpers.js";

const files = {
  "node_modules/ext-lib/index.d.ts": `export type LinkProps = { href: string };
export declare function Link(props: LinkProps): JSX.Element;
export declare const Fancy: (props: { size: number }) => JSX.Element;
`,
  "src/page.tsx": `import { Link, Fancy } from "ext-lib";

export function Page(): JSX.Element {
  return (
    <div>
      <Link href="/x" />
      <Fancy size={1} />
    </div>
  );
}
`,
};

describe("external JSX components", () => {
  const { nodes, edges } = collectMemoryPage(files);

  it("names an external function component external:<module>#<Tag>", () => {
    const node = nodes.find((n) => n.id === "external:ext-lib#Link");
    expect(node).toMatchObject({
      kind: "external",
      name: "Link",
      file: "",
      range: { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 },
    });
  });

  it("labels the external function component edge with its props type", () => {
    const edge = edges.find((e) => e.from === "external:ext-lib#Link");
    expect(edge).toMatchObject({
      kind: "jsx",
      supplies: "LinkProps",
      resolved: true,
      to: "src/page.tsx#Page",
    });
  });

  it("names an external const component external:<module>#<Tag>", () => {
    const node = nodes.find((n) => n.id === "external:ext-lib#Fancy");
    expect(node).toMatchObject({ kind: "external", file: "" });
  });

  it("emits a jsx edge with an empty label for the external const component", () => {
    const edge = edges.find((e) => e.from === "external:ext-lib#Fancy");
    expect(edge).toMatchObject({ kind: "jsx", supplies: "", resolved: true });
  });
});
