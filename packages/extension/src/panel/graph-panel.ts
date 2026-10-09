import * as vscode from "vscode";
import { PANEL_TITLE, PANEL_VIEW_TYPE } from "../ids.js";
import { buildWebviewHtml, createNonce } from "./html.js";

export class GraphPanel implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

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
    panel.onDidDispose(() => {
      this.panel = undefined;
    });
    this.panel = panel;
  }

  dispose(): void {
    this.panel?.dispose();
  }
}
