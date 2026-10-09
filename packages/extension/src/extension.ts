import * as vscode from "vscode";
import { COMMAND_SHOW_GRAPH } from "./ids.js";
import { GraphPanel } from "./panel/graph-panel.js";

export function activate(context: vscode.ExtensionContext): void {
  const panel = new GraphPanel(context.extensionUri);
  context.subscriptions.push(
    panel,
    vscode.commands.registerCommand(COMMAND_SHOW_GRAPH, () => panel.show()),
  );
}

export function deactivate(): void {}
