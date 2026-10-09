import { join } from "node:path";
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import * as vscode from "vscode";
import { ChangeTracker } from "./changes.js";
import {
  COMMAND_SHOW_GRAPH,
  COMMAND_SHOW_IN_CODE_SPIDER,
  SETTING_MAX_HEAP_MB,
} from "./ids.js";
import { JumpHandler } from "./navigation.js";
import { GraphPanel } from "./panel/graph-panel.js";
import { GraphSession, type CurrentGraph } from "./session.js";
import { WarmOnce } from "./warm-once.js";
import { EditorRevealer } from "./vscode/editor.js";
import { resolveFocusRequest } from "./vscode/focus-request.js";
import { notifier } from "./vscode/notifier.js";
import { getMaxHeapMb } from "./vscode/settings.js";
import { IndexingStatusBar } from "./vscode/status-bar.js";
import { spawnAnalysisWorker } from "./worker/spawn.js";
import { WorkerClient } from "./worker/worker-client.js";

/** What `activate` returns, so the smoke tests can inspect the extension. */
export type ExtensionApi = {
  currentGraph(): CurrentGraph | undefined;
  /** The entry point a webview click reaches; tests drive click-to-jump here. */
  handleWebviewMessage(message: WebviewToExtension): Promise<void>;
};

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const workerPath = join(context.extensionPath, "dist", "worker.cjs");
  const worker = new WorkerClient(() =>
    spawnAnalysisWorker(workerPath, getMaxHeapMb()),
  );
  const revealer = new EditorRevealer();
  const panel = new GraphPanel(context.extensionUri, (message) => {
    jumps.handle(message).catch((error: unknown) => {
      notifier.error(
        `Could not open that location: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  });
  const statusBar = new IndexingStatusBar();
  const changes = new ChangeTracker();
  const session = new GraphSession({
    worker,
    panel,
    notifier,
    indexing: statusBar,
    changes,
    maxHeapMb: getMaxHeapMb,
  });
  const jumps = new JumpHandler(() => session.currentGraph(), revealer);
  const showGraph = async (uri?: vscode.Uri, position?: vscode.Position) => {
    const request = await resolveFocusRequest(uri, position);
    if (request) await session.showGraph(request);
  };

  const warmOnce = new WarmOnce((file) => void session.warm(file));

  context.subscriptions.push(
    { dispose: () => worker.dispose() },
    revealer,
    panel,
    statusBar,
    vscode.commands.registerCommand(COMMAND_SHOW_GRAPH, showGraph),
    vscode.commands.registerCommand(COMMAND_SHOW_IN_CODE_SPIDER, showGraph),
    vscode.workspace.onDidSaveTextDocument((document) =>
      changes.markSaved(document.languageId, document.uri.fsPath),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTING_MAX_HEAP_MB)) {
        worker.recycle();
        warmOnce.reset();
        warmOnce.offer(vscode.window.activeTextEditor?.document);
      }
    }),
  );

  warmOnce.offer(vscode.window.activeTextEditor?.document);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) =>
      warmOnce.offer(editor?.document),
    ),
  );

  return {
    currentGraph: () => session.currentGraph(),
    handleWebviewMessage: (message) => jumps.handle(message),
  };
}

export function deactivate(): void {}
