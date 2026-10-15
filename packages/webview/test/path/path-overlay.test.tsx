import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PathSearch } from "../../src/host/protocol.js";
import { PathOverlay } from "../../src/path/PathOverlay.js";

const running: PathSearch = {
  id: 7,
  purpose: "search",
  from: "fetchUser",
  to: "renderAvatar",
  checked: 140,
  routes: 3,
  routesCapped: false,
};

type Clickable = ReactElement<{ disabled?: boolean; onClick(): void }>;

function buttons(node: ReactNode): Clickable[] {
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return Array.isArray(node) ? node.flatMap(buttons) : [];
  }
  const own = node.type === "button" ? [node as Clickable] : [];
  return [...own, ...buttons(node.props.children)];
}

describe("PathOverlay", () => {
  it("is a polite status with the text and a Cancel button", () => {
    const html = renderToStaticMarkup(
      <PathOverlay search={running} cancelling={false} onCancel={() => {}} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain(
      "Searching for paths from fetchUser to renderAvatar... 140 functions checked, 3 routes so far",
    );
    expect(html).toMatch(/<button[^>]*>Cancel<\/button>/);
    expect(html).not.toContain("disabled");
  });

  it("shows a disabled Cancelling... while cancelling", () => {
    const html = renderToStaticMarkup(
      <PathOverlay search={running} cancelling onCancel={() => {}} />,
    );
    expect(html).toMatch(
      /<button[^>]*disabled[^>]*>Cancelling\.\.\.<\/button>/,
    );
    expect(html).not.toContain(">Cancel<");
  });

  it("reports the search id when Cancel is pressed", () => {
    const onCancel = vi.fn();
    const tree = PathOverlay({ search: running, cancelling: false, onCancel });
    const [cancel] = buttons(tree);
    cancel?.props.onClick();
    expect(onCancel).toHaveBeenCalledWith(7);
  });
});
