import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NodeBox,
  type NodeBoxProps,
} from "../../../src/graph/nodes/NodeBox.js";
import { makeNode } from "../../support/slices.js";

function render(
  extra: Partial<NodeBoxProps> = {},
  overrides: Partial<Parameters<typeof makeNode>[0]> = {},
): string {
  return renderToStaticMarkup(
    <NodeBox
      node={makeNode({ id: "a#f", name: "f", ...overrides })}
      isFocus={false}
      {...extra}
    />,
  );
}

function classOf(html: string): string {
  return /class="(node-box[^"]*)"/.exec(html)?.[1] ?? "";
}

describe("NodeBox on a path graph", () => {
  it("adds on-route to a route box and not to another", () => {
    expect(classOf(render({ onRoute: true }))).toContain("on-route");
    expect(classOf(render())).not.toContain("on-route");
    expect(classOf(render({ onRoute: false }))).not.toContain("on-route");
  });

  it("shows the tag A, then B, with their titles before the name", () => {
    const start = render({ onRoute: true, routeTag: "A" });
    expect(start).toContain(
      '<span class="node-tag" title="Start of the path">A</span>',
    );
    expect(start.indexOf("node-tag")).toBeLessThan(start.indexOf("node-name"));
    const end = render({ onRoute: true, routeTag: "B" });
    expect(end).toContain(
      '<span class="node-tag" title="End of the path">B</span>',
    );
    expect(render()).not.toContain("node-tag");
  });

  it("adds is-marked and the tag A to a marked box", () => {
    const html = render({ marked: true });
    expect(classOf(html)).toContain("is-marked");
    expect(html).toContain(
      '<span class="node-tag" title="Start of the path">A</span>',
    );
    expect(classOf(render())).not.toContain("is-marked");
  });

  it("keeps the change and test classes on a route box", () => {
    const html = render({ onRoute: true }, { change: "added", isTest: true });
    expect(classOf(html)).toContain("on-route");
    expect(classOf(html)).toContain("change-added");
    expect(classOf(html)).toContain("is-test");
  });
});
