import * as vscode from "vscode";
import type { EditorPort, JumpTarget } from "../navigation.js";

/**
 * Opens files in the column of the last text editor the user used. Clicking
 * inside the webview makes the panel's group active, and opening there would
 * bury the code under the graph.
 */
export class EditorRevealer implements EditorPort, vscode.Disposable {
  private column: vscode.ViewColumn =
    vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
  private readonly subscription = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor?.viewColumn) this.column = editor.viewColumn;
    },
  );

  async reveal(target: JumpTarget): Promise<void> {
    const { range } = target;
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(target.file),
    );
    await vscode.window.showTextDocument(document, {
      viewColumn: this.column,
      selection: new vscode.Range(
        range.startLine,
        range.startCharacter,
        range.endLine,
        range.endCharacter,
      ),
    });
  }

  dispose(): void {
    this.subscription.dispose();
  }
}
