import { randomBytes } from "node:crypto";

export type WebviewHtmlInput = {
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri: string;
};

export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createNonce(): string {
  return randomBytes(16).toString("hex");
}

/**
 * React Flow positions nodes with inline styles, so `style-src` needs
 * 'unsafe-inline'. Scripts stay locked to the one nonce-tagged bundle.
 */
export function buildWebviewHtml(input: WebviewHtmlInput): string {
  const { cspSource, nonce, scriptUri, styleUri } = input;
  const csp = [
    "default-src 'none'",
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${escapeAttribute(styleUri)}" />
    <title>Code Spider</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${escapeAttribute(nonce)}" src="${escapeAttribute(scriptUri)}"></script>
  </body>
</html>
`;
}
