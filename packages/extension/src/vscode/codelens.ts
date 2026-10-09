import * as vscode from "vscode";
import { ANALYSABLE_LANGUAGE_IDS } from "../changes.js";
import {
  CODELENS_TITLE,
  COMMAND_SHOW_GRAPH,
  SETTING_CODELENS_ENABLED,
} from "../ids.js";

const MAX_LENS_LINES = 20_000;
const MAX_LENS_CHARS = 1_000_000;

export const CODELENS_SELECTOR: vscode.DocumentSelector =
  ANALYSABLE_LANGUAGE_IDS.map((language) => ({ scheme: "file", language }));

export class GraphCodeLensProvider
  implements vscode.CodeLensProvider, vscode.Disposable
{
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changed.event;

  refresh(): void {
    this.changed.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const enabled = vscode.workspace
      .getConfiguration()
      .get<boolean>(SETTING_CODELENS_ENABLED, true);
    if (!enabled || document.lineCount > MAX_LENS_LINES) return [];
    const text = document.getText();
    if (text.length > MAX_LENS_CHARS) return [];

    // TypeScript is large; load it when the first lens is requested, not at activation.
    const { findCallableDeclarations } = await import("../declarations.js");
    if (token.isCancellationRequested) return [];
    return findCallableDeclarations(text, document.fileName).map(
      (declaration) =>
        new vscode.CodeLens(
          new vscode.Range(declaration.lensLine, 0, declaration.lensLine, 0),
          {
            title: CODELENS_TITLE,
            tooltip: `Show ${declaration.name} in Code Spider`,
            command: COMMAND_SHOW_GRAPH,
            arguments: [
              document.uri,
              new vscode.Position(declaration.line, declaration.character),
            ],
          },
        ),
    );
  }

  dispose(): void {
    this.changed.dispose();
  }
}
