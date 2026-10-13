import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NodeBox,
  type NodeBoxProps,
} from "../../../src/graph/nodes/NodeBox.js";
import { codeRegionHeight } from "../../../src/graph/nodes/node-size.js";
import { makeNode } from "../../support/slices.js";

function render(
  overrides: Parameters<typeof makeNode>[0],
  extra: Partial<NodeBoxProps> = {},
): string {
  return renderToStaticMarkup(
    <NodeBox node={makeNode(overrides)} isFocus={false} {...extra} />,
  );
}

const chip = {
  id: "external:x#y",
  kind: "external",
  file: "",
  lineCount: 0,
  codePreview: "",
} as const;

describe("NodeBox open and closed", () => {
  it("renders the header and no pre or node-code when closed", () => {
    const html = render({ id: "a#f" }, { open: false });
    expect(html).toContain('class="node-header"');
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("node-code");
  });

  it("renders the code region with the same height style when open", () => {
    const node = makeNode({ id: "a#f", lineCount: 10 });
    const html = renderToStaticMarkup(
      <NodeBox node={node} isFocus={false} open />,
    );
    expect(html).toContain('<pre class="node-code"');
    expect(html).toContain(`height:${codeRegionHeight(node)}px`);
  });

  it("marks the box is-closed when closed and is-open when open", () => {
    const closed = render({ id: "a#f" }, { open: false });
    const open = render({ id: "a#f" }, { open: true });
    expect(closed).toContain("is-closed");
    expect(closed).not.toContain("is-open");
    expect(open).toContain("is-open");
    expect(open).not.toContain("is-closed");
  });

  it("is is-closed with no pre for a box without a code region, even when open", () => {
    const html = render(chip, { open: true });
    expect(html).toContain("is-closed");
    expect(html).not.toContain("is-open");
    expect(html).not.toContain("<pre");
  });

  it("is closed without the open prop", () => {
    const html = render({ id: "a#f" });
    expect(html).toContain("is-closed");
    expect(html).not.toContain("<pre");
  });
});
