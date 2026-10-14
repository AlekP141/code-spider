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

function pressableButtons(node: ReactNode): Pressable[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return Array.isArray(node) ? node.flatMap(pressableButtons) : [];
  }
  const own = "aria-pressed" in node.props ? [node as Pressable] : [];
  return [...own, ...pressableButtons(node.props.children)];
}

function buttonTag(html: string, label: string): string {
  const match = new RegExp(
    `<button[^>]*>${label.replace(/[()]/g, "\\$&")}</button>`,
  ).exec(html);
  if (!match) throw new Error(`no ${label} button in ${html}`);
  return match[0];
}

describe("the Tests group", () => {
  it("sits after Changes and before Spacing, Show before Hide, with the visible text Tests", () => {
    const html = render();
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="Tests"/);
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>Tests<\/span>/);
    expect(html.indexOf("Changes")).toBeLessThan(html.indexOf("Tests"));
    expect(html.lastIndexOf("Tests")).toBeLessThan(html.indexOf("Spacing"));
    expect(html.indexOf(">Show<")).toBeLessThan(html.indexOf(">Hide<"));
  });

  it("presses the button of the active visibility only", () => {
    const show = render({ testVisibility: "show" });
    expect(buttonTag(show, "Show")).toContain('aria-pressed="true"');
    expect(buttonTag(show, "Hide")).toContain('aria-pressed="false"');
    const hide = render({ testVisibility: "hide" });
    expect(buttonTag(hide, "Show")).toContain('aria-pressed="false"');
    expect(buttonTag(hide, "Hide (0)")).toContain('aria-pressed="true"');
  });

  it("reports a click on the other button and ignores one on the active button", () => {
    const picked: string[] = [];
    const tree = Toolbar({
      ...props(),
      testVisibility: "show",
      onTestVisibility: (value) => picked.push(value),
    });
    const [, , , , show, hide] = pressableButtons(tree);
    show?.props.onClick();
    expect(picked).toEqual([]);
    hide?.props.onClick();
    expect(picked).toEqual(["hide"]);
  });

  it("gives each button its title", () => {
    const html = render();
    expect(buttonTag(html, "Show")).toContain(
      'title="Show test code faded, with dashed lines"',
    );
    expect(buttonTag(html, "Hide")).toContain(
      'title="Hide test code and the boxes that only lead to it"',
    );
  });

  it("shows the hidden count on Hide while it is pressed, including Hide (0)", () => {
    const three = render({ testVisibility: "hide", hiddenTests: 3 });
    expect(buttonTag(three, "Hide (3)")).toContain('aria-pressed="true"');
    expect(render({ testVisibility: "hide", hiddenTests: 0 })).toContain(
      ">Hide (0)<",
    );
  });

  it("shows no count on Show or on an unpressed Hide", () => {
    const shown = render({ testVisibility: "show", hiddenTests: 4 });
    expect(shown).toContain(">Hide<");
    expect(shown).not.toContain("Hide (");
    expect(shown).not.toContain("Show (");
    const hidden = render({ testVisibility: "hide", hiddenTests: 4 });
    expect(hidden).toContain(">Show<");
    expect(hidden).not.toContain("Show (");
  });
});
