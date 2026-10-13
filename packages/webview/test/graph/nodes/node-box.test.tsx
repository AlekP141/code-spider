import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NodeBox,
  type NodeBoxProps,
} from "../../../src/graph/nodes/NodeBox.js";
import { HEADER_HEIGHT } from "../../../src/graph/constants.js";
import { codeRegionHeight } from "../../../src/graph/nodes/node-size.js";
import { makeNode } from "../../support/slices.js";

function render(
  overrides: Parameters<typeof makeNode>[0],
  isFocus = false,
  extra: Partial<NodeBoxProps> = {},
): string {
  return renderToStaticMarkup(
    <NodeBox node={makeNode(overrides)} isFocus={isFocus} open {...extra} />,
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
    const html = renderToStaticMarkup(
      <NodeBox node={node} isFocus={false} open />,
    );
    expect(html).toContain(
      `class="node-header" style="height:${HEADER_HEIGHT}px"`,
    );
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

describe("NodeBox code lines", () => {
  const codePreview = "function f() {\n  const a = 1;\n\n\t\treturn a;\n}";

  function preHtml(overrides: Parameters<typeof makeNode>[0]): string {
    return /<pre[\s\S]*<\/pre>/.exec(render(overrides))?.[0] ?? "";
  }

  function preText(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&amp;", "&");
  }

  it("renders indent then a code-text span for each non-blank line", () => {
    const html = preHtml({ id: "a#f", lineCount: 5, codePreview });
    expect(html).toContain(
      '\n  <span class="code-text">const a = 1;</span>\n',
    );
    expect(html).toContain(
      '\n\t\t<span class="code-text">return a;</span>\n',
    );
    expect(html).toContain('<span class="code-text">function f() {</span>');
  });

  it("renders blank lines without a span", () => {
    const html = preHtml({ id: "a#f", lineCount: 3, codePreview: "a\n\n \nb" });
    expect(html).toContain('</span>\n\n \n<span class="code-text">b</span>');
    expect(html.match(/code-text/g)).toHaveLength(2);
  });

  it("keeps the pre's text and height as they were", () => {
    const node = makeNode({ id: "a#f", lineCount: 5, codePreview });
    const html = renderToStaticMarkup(
      <NodeBox node={node} isFocus={false} open />,
    );
    const pre = /<pre[\s\S]*<\/pre>/.exec(html)?.[0] ?? "";
    expect(preText(pre)).toBe(codePreview);
    expect(pre).toContain(`height:${codeRegionHeight(node)}px`);
  });

  it("still renders no pre for chips", () => {
    const html = render({
      id: "external:x#y",
      kind: "external",
      lineCount: 0,
      codePreview: "",
    });
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("code-text");
  });
});

describe("NodeBox state markers", () => {
  const f = { id: "a#f" };

  it("never renders an expand or collapse button", () => {
    for (const html of [
      render(f),
      render(f, false, { loading: true }),
      render(f, false, { pinned: true }),
    ]) {
      expect(html).not.toContain('title="Expand"');
      expect(html).not.toContain('title="Collapse"');
      expect(html).not.toContain(">+</button>");
    }
  });

  it("renders a spinner while loading", () => {
    const html = render(f, false, { loading: true });
    expect(html).toContain('role="status"');
    expect(html).toContain("node-spinner");
    expect(html).not.toContain("<button");
  });

  it("renders no marker markup when idle or without props", () => {
    for (const html of [render(f, false, { loading: false }), render(f)]) {
      expect(html).not.toContain("<button");
      expect(html).not.toContain("node-controls");
      expect(html).not.toContain("node-spinner");
    }
  });

  it("shows the pin icon only when pinned, titled Unpin", () => {
    expect(render(f)).not.toContain("Unpin");
    const html = render(f, false, { pinned: true });
    expect(html).toContain('title="Unpin"');
    expect(html).toContain("<svg");
  });

  it("puts the failure message in the strip's text and title", () => {
    const html = render(f, false, { failure: "Could not expand: gone" });
    expect(html).toContain('role="alert"');
    expect(html).toContain('title="Could not expand: gone"');
    expect(html).toContain(">Could not expand: gone</div>");
    expect(render(f)).not.toContain('role="alert"');
  });
});
