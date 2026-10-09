import type {
  ExtensionToWebview,
  WebviewToExtension,
} from "@code-spider/webview/protocol";
import * as vscode from "vscode";
import { PANEL_TITLE, PANEL_VIEW_TYPE } from "../ids.js";
import { buildWebviewHtml, createNonce } from "./html.js";
import { MessageGate } from "./message-gate.js";
import { parseWebviewMessage } from "./messages.js";

export class GraphPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;
  private readonly gate = new MessageGate((message) => {
    void this.panel?.webview.postMessage(message);
  });

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly onMessage: (message: WebviewToExtension) => void,
  ) {}

  /** Queued until the webview reports ready, then delivered. */
  post(message: ExtensionToWebview): void {
    this.gate.post(message);
  }

  /** Opens the panel beside the editor, or reveals it without moving it. */
  show(): void {
    if (this.panel) {
      this.panel.reveal(undefined, true);
      return;
    }

    const root = vscode.Uri.joinPath(this.extensionUri, "dist", "webview");
    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      PANEL_TITLE,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [root],
      },
    );
    const assetUri = (name: string) =>
      panel.webview.asWebviewUri(vscode.Uri.joinPath(root, name)).toString();
    panel.webview.html = buildWebviewHtml({
      cspSource: panel.webview.cspSource,
      nonce: createNonce(),
      scriptUri: assetUri("index.js"),
      styleUri: assetUri("index.css"),
    });
    this.gate.reset();
    panel.webview.onDidReceiveMessage((raw: unknown) => this.receive(raw));
    panel.onDidDispose(() => {
      this.panel = undefined;
      this.gate.reset();
    });
    this.panel = panel;
  }

  dispose(): void {
    this.panel?.dispose();
  }

  private receive(raw: unknown): void {
    const message = parseWebviewMessage(raw);
    if (!message) return;
    if (message.type === "ready") this.gate.markReady();
    else this.onMessage(message);
  }
}
