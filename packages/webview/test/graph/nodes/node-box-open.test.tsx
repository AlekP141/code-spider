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

function count(html: string, tag: string): number {
  return html.split(tag).length - 1;
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

describe("NodeBox chevron", () => {
  const closedChevron = render({ id: "a#f" }, { open: false });
  const openChevron = render({ id: "a#f" }, { open: true });

  it("shows a closed box's chevron titled and labelled Show code", () => {
    expect(closedChevron).toContain('title="Show code"');
    expect(closedChevron).toContain('aria-label="Show code"');
    expect(closedChevron).not.toContain("Hide code");
  });

  it("shows an open box's chevron titled and labelled Hide code", () => {
    expect(openChevron).toContain('title="Hide code"');
    expect(openChevron).toContain('aria-label="Hide code"');
    expect(openChevron).not.toContain("Show code");
  });

  it("rotates only the open chevron by 90 degrees", () => {
    expect(openChevron).toContain('transform="rotate(90 8 8)"');
    expect(closedChevron).not.toContain("rotate");
  });

  it("has no chevron for a box without a code region, even when open", () => {
    const html = render(chip, { open: true });
    expect(html).not.toContain("<button");
    expect(html).not.toContain("node-controls");
  });

  it("puts the chevron after the pin and the spinner", () => {
    const html = render(
      { id: "a#f" },
      { pinned: true, loading: true, open: false },
    );
    const chevron = html.indexOf("Show code");
    expect(html.indexOf("Unpin")).toBeLessThan(chevron);
    expect(html.indexOf("node-spinner")).toBeLessThan(chevron);
  });
});

describe("NodeBox failure message", () => {
  it("hangs after the box as its sibling, outside it", () => {
    const html = render({ id: "a#f" }, { failure: "Could not expand: gone" });
    const strip = html.indexOf('<div class="node-failure"');
    expect(strip).toBeGreaterThan(0);
    const before = html.slice(0, strip);
    expect(count(before, "<div")).toBe(count(before, "</div>"));
    expect(html.slice(strip)).toBe(
      '<div class="node-failure" role="alert" title="Could not expand: gone">Could not expand: gone</div>',
    );
  });
});
