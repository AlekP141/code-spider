import * as vscode from "vscode";
import { isAnalysableLanguage } from "../changes/changes.js";
import type { FocusRequest } from "../session/session.js";

const NOT_SUPPORTED =
  "Code Spider works on TypeScript and JavaScript files. Open one and place the cursor in a function.";

/**
 * The document and position for a Show Graph invocation. Keybinding and
 * palette pass nothing, and the context menu passes the document.
 */
export async function resolveFocusRequest(
  uri?: vscode.Uri,
  position?: vscode.Position,
): Promise<FocusRequest | undefined> {
  const editor = vscode.window.activeTextEditor;
  const document = uri
    ? await vscode.workspace.openTextDocument(uri)
    : editor?.document;
  if (
    !document ||
    document.uri.scheme !== "file" ||
    !isAnalysableLanguage(document.languageId)
  ) {
    void vscode.window.showInformationMessage(NOT_SUPPORTED);
    return undefined;
  }

  const at =
    position instanceof vscode.Position
      ? position
      : editor?.document === document
        ? editor.selection.active
        : new vscode.Position(0, 0);
  return {
    file: document.uri.fsPath,
    line: at.line,
    character: at.character,
    isDirty: document.isDirty,
  };
}
