import * as vscode from "vscode";
import type { DocumentsPort } from "../ports.js";

export const workspaceDocuments: DocumentsPort = {
  unsavedFiles: () =>
    vscode.workspace.textDocuments
      .filter((document) => document.isDirty && document.uri.scheme === "file")
      .map((document) => document.uri.fsPath),
};
