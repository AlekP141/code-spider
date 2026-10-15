import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toolbar, type ToolbarProps } from "../../src/toolbar/Toolbar.js";

const noop = () => undefined;

function render(overrides: Partial<ToolbarProps> = {}): string {
  return renderToStaticMarkup(
    <Toolbar
      canBack
      canTidy
      canRefresh
      changedSince={false}
      columnGap={192}
      edgeStyle="stepped"
      diffMode="uncommitted"
      testVisibility="show"
      hiddenTests={0}
      onBack={noop}
      onTidy={noop}
      onRefresh={noop}
      onColumnGap={noop}
      onEdgeStyle={noop}
      onDiffMode={noop}
      onTestVisibility={noop}
      {...overrides}
    />,
  );
}

describe("Toolbar path summary", () => {
  it("renders the summary as a status with its title when given", () => {
    const html = render({
      pathSummary: { text: "Paths a → z: 3 routes", title: "full text" },
    });
    expect(html).toContain(
      '<div class="toolbar-summary" role="status" title="full text">Paths a → z: 3 routes</div>',
    );
  });

  it("has no summary element without it", () => {
    const html = render();
    expect(html).not.toContain("toolbar-summary");
    expect(html).not.toContain('role="status"');
  });
});
