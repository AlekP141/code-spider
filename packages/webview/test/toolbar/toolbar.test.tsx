import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toolbar, type ToolbarProps } from "../../src/toolbar/Toolbar.js";

const noop = () => undefined;

function props(overrides: Partial<ToolbarProps> = {}): ToolbarProps {
  return {
    canBack: true,
    canTidy: true,
    canRefresh: true,
    changedSince: false,
    columnGap: 192,
    edgeStyle: "stepped",
    diffMode: "uncommitted",
    testVisibility: "show",
    hiddenTests: 0,
    onBack: noop,
    onTidy: noop,
    onRefresh: noop,
    onColumnGap: noop,
    onEdgeStyle: noop,
    onDiffMode: noop,
    onTestVisibility: noop,
    ...overrides,
  };
}

function render(overrides: Partial<ToolbarProps> = {}): string {
  return renderToStaticMarkup(<Toolbar {...props(overrides)} />);
}

type Pressable = ReactElement<{ "aria-pressed"?: boolean; onClick(): void }>;

/** Toolbar is a plain function component, so its element tree can be walked. */
function pressableButtons(node: ReactNode): Pressable[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return Array.isArray(node) ? node.flatMap(pressableButtons) : [];
  }
  const own = "aria-pressed" in node.props ? [node as Pressable] : [];
  return [...own, ...pressableButtons(node.props.children)];
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

  it("puts the Lines group between Refresh and Spacing", () => {
    const html = render();
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Lines"/);
    expect(html.indexOf("Refresh")).toBeLessThan(html.indexOf("Lines"));
    expect(html.indexOf("Lines")).toBeLessThan(html.indexOf("Spacing"));
    expect(html.indexOf("Stepped")).toBeLessThan(html.indexOf("Curved"));
  });

  it("presses the button of the active style only", () => {
    const stepped = render({ edgeStyle: "stepped" });
    expect(buttonTag(stepped, "Stepped")).toContain('aria-pressed="true"');
    expect(buttonTag(stepped, "Curved")).toContain('aria-pressed="false"');
    const curved = render({ edgeStyle: "curved" });
    expect(buttonTag(curved, "Stepped")).toContain('aria-pressed="false"');
    expect(buttonTag(curved, "Curved")).toContain('aria-pressed="true"');
  });

  it("reports a click on the other style and ignores one on the active style", () => {
    const picked: string[] = [];
    const tree = Toolbar({
      ...props(),
      edgeStyle: "stepped",
      onEdgeStyle: (value) => picked.push(value),
    });
    const [stepped, curved] = pressableButtons(tree);
    stepped?.props.onClick();
    expect(picked).toEqual([]);
    curved?.props.onClick();
    expect(picked).toEqual(["curved"]);
  });

  it("puts the Changes group after Lines and before Spacing, Uncommitted before PR", () => {
    const html = render();
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Changes"/);
    expect(html.indexOf("Lines")).toBeLessThan(html.indexOf("Changes"));
    expect(html.indexOf("Changes")).toBeLessThan(html.indexOf("Spacing"));
    expect(html.indexOf("Uncommitted")).toBeLessThan(html.indexOf(">PR<"));
  });

  it("presses the button of the active mode only", () => {
    const uncommitted = render({ diffMode: "uncommitted" });
    expect(buttonTag(uncommitted, "Uncommitted")).toContain(
      'aria-pressed="true"',
    );
    expect(buttonTag(uncommitted, "PR")).toContain('aria-pressed="false"');
    const pr = render({ diffMode: "pr" });
    expect(buttonTag(pr, "Uncommitted")).toContain('aria-pressed="false"');
    expect(buttonTag(pr, "PR")).toContain('aria-pressed="true"');
  });

  it("reports a click on the other mode and ignores one on the active mode", () => {
    const picked: string[] = [];
    const tree = Toolbar({
      ...props(),
      diffMode: "uncommitted",
      onDiffMode: (value) => picked.push(value),
    });
    const [, , uncommitted, pr] = pressableButtons(tree);
    uncommitted?.props.onClick();
    expect(picked).toEqual([]);
    pr?.props.onClick();
    expect(picked).toEqual(["pr"]);
  });

  it("gives each button its title", () => {
    const html = render();
    expect(buttonTag(html, "Uncommitted")).toContain(
      'title="Colour the functions you have added or changed since your last commit"',
    );
    expect(buttonTag(html, "PR")).toContain(
      'title="Colour the functions added or changed since this branch left the main branch"',
    );
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
