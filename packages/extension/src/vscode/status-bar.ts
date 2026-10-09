import * as vscode from "vscode";
import type { IndexingIndicator } from "../ports.js";

export class IndexingStatusBar implements IndexingIndicator, vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0,
  );

  constructor() {
    this.item.text = "$(sync~spin) Code Spider: indexing";
    this.item.tooltip =
      "Code Spider is loading the project so the first graph appears quickly.";
  }

  set(active: boolean): void {
    if (active) this.item.show();
    else this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
