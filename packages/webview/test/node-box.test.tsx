import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NodeBox } from "../src/graph/NodeBox.js";
import { codeRegionHeight } from "../src/graph/node-size.js";
import { makeNode } from "./support/slices.js";

function render(
  overrides: Parameters<typeof makeNode>[0],
  isFocus = false,
): string {
  return renderToStaticMarkup(
    <NodeBox node={makeNode(overrides)} isFocus={isFocus} />,
  );
}

describe("NodeBox", () => {
  it("shows the name on the left and the input type on the right with titles", () => {
    const html = render({
      id: "a#validate",
      name: "validate",
      inputType: "{ email: string; name: string }",
    });
    expect(html).toContain(
      '<span class="node-name" title="validate (src/a.ts)">validate</span>',
    );
    expect(html).toContain(
      '<span class="node-input" title="{ email: string; name: string }">{ email: string; name: string }</span>',
    );
    expect(html.indexOf("node-name")).toBeLessThan(html.indexOf("node-input"));
  });

  it("shows the async badge only for async functions", () => {
    expect(render({ id: "a#f", isAsync: true })).toContain("node-async");
    expect(render({ id: "a#f", isAsync: false })).not.toContain("node-async");
  });

  it("sizes the header and the code region from the shared constants", () => {
    const node = makeNode({ id: "a#f", lineCount: 10 });
    const html = renderToStaticMarkup(<NodeBox node={node} isFocus={false} />);
    expect(html).toContain('class="node-header" style="height:28px"');
    expect(html).toContain(`height:${codeRegionHeight(node)}px`);
  });

  it("renders the code text escaped", () => {
    const html = render({ id: "a#f", codePreview: "if (a < b && c) {}" });
    expect(html).toContain("if (a &lt; b &amp;&amp; c) {}");
  });

  it("clips and fades only functions longer than 25 lines", () => {
    expect(render({ id: "a#f", lineCount: 26 })).toContain(
      "node-code is-clipped",
    );
    expect(render({ id: "a#f", lineCount: 25 })).not.toContain("is-clipped");
  });

  it("renders chips without a code region and with an empty right slot", () => {
    const html = render({
      id: "external:tiny-lib#persist",
      kind: "external",
      name: "persist",
      file: "",
      inputType: "",
      lineCount: 0,
      codePreview: "",
    });
    expect(html).not.toContain("<pre");
    expect(html).toContain('<span class="node-input"></span>');
    expect(html).toContain('title="persist"');
    expect(html).toContain("kind-external");
  });

  it("marks the kind and the focus node", () => {
    expect(render({ id: "a#F", kind: "component" })).toContain(
      "node-box kind-component",
    );
    expect(render({ id: "a#F" }, true)).toContain("is-focus");
    expect(render({ id: "a#F" }, false)).not.toContain("is-focus");
  });
});
