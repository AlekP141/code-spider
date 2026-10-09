import { describe, expect, it } from "vitest";
import {
  buildWebviewHtml,
  createNonce,
  escapeAttribute,
} from "../src/panel/html.js";

const input = {
  cspSource: "https://example.vscode-cdn.net",
  nonce: "abc123",
  scriptUri: "https://example.vscode-cdn.net/webview/index.js",
  styleUri: "https://example.vscode-cdn.net/webview/index.css",
};

function cspOf(html: string): string {
  const match = /Content-Security-Policy" content="([^"]*)"/.exec(html);
  return match?.[1] ?? "";
}

describe("buildWebviewHtml", () => {
  it("allows only the nonce-tagged script and local styles", () => {
    const csp = cspOf(buildWebviewHtml(input));
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-abc123'");
    expect(csp).toContain(
      "style-src https://example.vscode-cdn.net 'unsafe-inline'",
    );
    expect(csp).not.toContain("unsafe-eval");
  });

  it("tags the script element with the same nonce and source", () => {
    const html = buildWebviewHtml(input);
    expect(html).toContain(
      '<script nonce="abc123" src="https://example.vscode-cdn.net/webview/index.js"></script>',
    );
  });

  it("links the stylesheet and provides the mount point", () => {
    const html = buildWebviewHtml(input);
    expect(html).toContain(
      '<link rel="stylesheet" href="https://example.vscode-cdn.net/webview/index.css" />',
    );
    expect(html).toContain('<div id="root"></div>');
  });

  it("escapes attribute values", () => {
    const html = buildWebviewHtml({ ...input, styleUri: 'a"b<c>&d' });
    expect(html).toContain('href="a&quot;b&lt;c&gt;&amp;d"');
  });
});

describe("escapeAttribute", () => {
  it("escapes ampersands, quotes and angle brackets", () => {
    expect(escapeAttribute(`<a href="x">&`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;",
    );
  });
});

describe("createNonce", () => {
  it("returns 32 hex characters and differs between calls", () => {
    const first = createNonce();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(createNonce()).not.toBe(first);
  });
});
