import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NodeBox, type NodeBoxProps } from "../src/graph/NodeBox.js";
import { codeRegionHeight } from "../src/graph/node-size.js";
import { makeNode } from "./support/slices.js";

function render(
  overrides: Parameters<typeof makeNode>[0],
  isFocus = false,
  extra: Partial<NodeBoxProps> = {},
): string {
  return renderToStaticMarkup(
    <NodeBox node={makeNode(overrides)} isFocus={isFocus} {...extra} />,
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

describe("NodeBox controls", () => {
  const f = { id: "a#f" };

  it("renders the expand, disabled expand and collapse buttons with titles", () => {
    const expand = render(f, false, { control: "expand" });
    expect(expand).toContain('title="Expand"');
    expect(expand).toContain(">+</button>");
    expect(expand).not.toContain("disabled");

    const disabled = render(f, false, { control: "expandDisabled" });
    expect(disabled).toContain('title="Expand"');
    expect(disabled).toContain("disabled");

    const collapse = render(f, false, { control: "collapse" });
    expect(collapse).toContain('title="Collapse"');
    expect(collapse).toContain(">\u2212</button>");
  });

  it("renders a spinner and no button while loading", () => {
    const html = render(f, false, { control: "loading" });
    expect(html).toContain('role="status"');
    expect(html).toContain("node-spinner");
    expect(html).not.toContain("<button");
  });

  it("renders no control markup for none or without a control", () => {
    for (const html of [render(f, false, { control: "none" }), render(f)]) {
      expect(html).not.toContain("<button");
      expect(html).not.toContain("node-controls");
      expect(html).not.toContain("node-spinner");
    }
  });

  it("shows the pin icon only when pinned, before the control", () => {
    expect(render(f, false, { control: "expand" })).not.toContain("Unpin");
    const html = render(f, false, { control: "expand", pinned: true });
    expect(html).toContain('title="Unpin"');
    expect(html).toContain("<svg");
    expect(html.indexOf("Unpin")).toBeLessThan(html.indexOf('title="Expand"'));
    expect(render(f, false, { pinned: true })).toContain("Unpin");
  });

  it("puts the failure message in the strip's text and title", () => {
    const html = render(f, false, { failure: "Could not expand: gone" });
    expect(html).toContain('role="alert"');
    expect(html).toContain('title="Could not expand: gone"');
    expect(html).toContain(">Could not expand: gone</div>");
    expect(render(f)).not.toContain('role="alert"');
  });
});
