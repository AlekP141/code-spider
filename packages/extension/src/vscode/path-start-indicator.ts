import type { PathMark } from "@code-spider/webview/protocol";
import * as vscode from "vscode";
import { COMMAND_CLEAR_PATH_START, CONTEXT_PATH_START_MARKED } from "../ids.js";

export class PathStartIndicator implements vscode.Disposable {
  private readonly label = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1,
  );
  private readonly clear = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    0,
  );

  constructor() {
    this.clear.text = "$(close)";
    this.clear.tooltip = "Clear Path Start";
    this.clear.command = COMMAND_CLEAR_PATH_START;
  }

  show(mark: PathMark | undefined): void {
    if (mark) {
      const file = mark.nodeId.split("#")[0];
      this.label.text = `Path from ${mark.name}`;
      this.label.tooltip = `${mark.name} in ${file}. Run Code Spider: Path to here on another function to finish.`;
      this.label.show();
      this.clear.show();
    } else {
      this.label.hide();
      this.clear.hide();
    }
    void vscode.commands.executeCommand(
      "setContext",
      CONTEXT_PATH_START_MARKED,
      mark !== undefined,
    );
  }

  dispose(): void {
    this.label.dispose();
    this.clear.dispose();
  }
}
