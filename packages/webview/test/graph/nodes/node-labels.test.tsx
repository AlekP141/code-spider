import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NodeLabels } from "../../../src/graph/nodes/NodeLabels.js";

describe("NodeLabels", () => {
  it("renders one element per line with its kind class and the full text in title", () => {
    const html = renderToStaticMarkup(
      <NodeLabels
        lines={[
          { kind: "returns", text: "User" },
          { kind: "jsx", text: "Props" },
          { kind: "passes", text: "() => void" },
        ]}
      />,
    );
    expect(html).toContain(
      '<span class="node-label label-returns" title="User">User</span>',
    );
    expect(html).toContain(
      '<span class="node-label label-jsx" title="Props">Props</span>',
    );
    expect(html).toContain(
      '<span class="node-label label-passes" title="() =&gt; void">() =&gt; void</span>',
    );
    expect(html.match(/node-label /g)).toHaveLength(3);
  });

  it("puts returns first in the markup and renders nothing for no lines", () => {
    const html = renderToStaticMarkup(
      <NodeLabels
        lines={[
          { kind: "returns", text: "R" },
          { kind: "passes", text: "P" },
        ]}
      />,
    );
    expect(html.indexOf("label-returns")).toBeLessThan(
      html.indexOf("label-passes"),
    );
    expect(renderToStaticMarkup(<NodeLabels lines={[]} />)).toBe("");
  });
});
