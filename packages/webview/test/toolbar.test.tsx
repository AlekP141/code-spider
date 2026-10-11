import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toolbar, type ToolbarProps } from "../src/toolbar/Toolbar.js";

const noop = () => undefined;

function render(overrides: Partial<ToolbarProps> = {}): string {
  return renderToStaticMarkup(
    <Toolbar
      canBack
      canTidy
      canRefresh
      changedSince={false}
      columnGap={192}
      onBack={noop}
      onTidy={noop}
      onRefresh={noop}
      onColumnGap={noop}
      {...overrides}
    />,
  );
}

function buttonTag(html: string, label: string): string {
  const match = new RegExp(`<button[^>]*>[^<]*${label}[^<]*</button>`).exec(
    html,
  );
  if (!match) throw new Error(`no ${label} button in ${html}`);
  return match[0];
}

function refreshButton(html: string): string {
  const match = /<button[^>]*>Refresh.*?<\/button>/.exec(html);
  if (!match) throw new Error(`no Refresh button in ${html}`);
  return match[0];
}

describe("Toolbar", () => {
  it("disables Back and Tidy from canBack and canTidy", () => {
    const off = render({ canBack: false, canTidy: false });
    expect(buttonTag(off, "Back")).toContain("disabled");
    expect(buttonTag(off, "Tidy")).toContain("disabled");
    const on = render();
    expect(buttonTag(on, "Back")).not.toContain("disabled");
    expect(buttonTag(on, "Tidy")).not.toContain("disabled");
  });

  it("puts Refresh between Tidy and Spacing with its title", () => {
    const html = render();
    const tag = buttonTag(html, "Refresh");
    expect(tag).toContain('title="Re-read the code for this graph"');
    expect(html.indexOf("Tidy")).toBeLessThan(html.indexOf("Refresh"));
    expect(html.indexOf("Refresh")).toBeLessThan(html.indexOf("Spacing"));
  });

  it("shows the dot and swaps the title only when files changed", () => {
    const label = "Files changed since this graph was drawn";
    const quiet = render();
    expect(quiet).not.toContain('role="img"');
    expect(refreshButton(quiet)).not.toContain(label);
    expect(refreshButton(quiet)).toContain('title="Re-read the code');

    const tag = refreshButton(render({ changedSince: true }));
    expect(tag).toContain(`title="${label}"`);
    expect(tag).not.toContain("Re-read the code");
    expect(tag).toMatch(
      /^<button[^>]*>Refresh<span[^>]*><\/span><\/button>$/,
    );
    expect(tag).toContain(`role="img"`);
    expect(tag).toContain(`aria-label="${label}"`);
  });

  it("disables Refresh from canRefresh", () => {
    expect(buttonTag(render({ canRefresh: false }), "Refresh")).toContain(
      "disabled",
    );
    expect(buttonTag(render(), "Refresh")).not.toContain("disabled");
  });

  it("carries the slider's range, step and current value", () => {
    const html = render({ columnGap: 128 });
    expect(html).toContain('type="range"');
    expect(html).toContain('min="32"');
    expect(html).toContain('max="480"');
    expect(html).toContain('step="16"');
    expect(html).toContain('value="128"');
  });

  it("keeps the slider enabled when Back and Tidy are off", () => {
    const html = render({ canBack: false, canTidy: false });
    expect(/<input[^>]*disabled/.test(html)).toBe(false);
  });

  it("labels the slider Spacing and shows its value in pixels", () => {
    const html = render();
    expect(html).toContain("Spacing");
    expect(html).toContain("192px");
  });
});
