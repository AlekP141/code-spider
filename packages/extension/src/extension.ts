import { join } from "node:path";
import * as vscode from "vscode";
import { ChangeTracker } from "./changes.js";
import { COMMAND_SHOW_GRAPH, SETTING_MAX_HEAP_MB } from "./ids.js";
import { GraphPanel } from "./panel/graph-panel.js";
import { GraphSession, type CurrentGraph } from "./session.js";
import { WarmOnce } from "./warm-once.js";
import { resolveFocusRequest } from "./vscode/focus-request.js";
import { notifier } from "./vscode/notifier.js";
import { getMaxHeapMb } from "./vscode/settings.js";
import { IndexingStatusBar } from "./vscode/status-bar.js";
import { spawnAnalysisWorker } from "./worker/spawn.js";
import { WorkerClient } from "./worker/worker-client.js";

/** What `activate` returns, so the smoke tests can inspect the extension. */
export type ExtensionApi = {
  currentGraph(): CurrentGraph | undefined;
};

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const workerPath = join(context.extensionPath, "dist", "worker.cjs");
  const worker = new WorkerClient(() =>
    spawnAnalysisWorker(workerPath, getMaxHeapMb()),
  );
  const panel = new GraphPanel(context.extensionUri);
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

  context.subscriptions.push(
    { dispose: () => worker.dispose() },
    panel,
    statusBar,
    vscode.commands.registerCommand(
      COMMAND_SHOW_GRAPH,
      async (uri?: vscode.Uri, position?: vscode.Position) => {
        const request = await resolveFocusRequest(uri, position);
        if (request) await session.showGraph(request);
      },
    ),
    vscode.workspace.onDidSaveTextDocument((document) =>
      changes.markSaved(document.languageId, document.uri.fsPath),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTING_MAX_HEAP_MB)) worker.recycle();
    }),
  );

  const warmOnce = new WarmOnce((file) => void session.warm(file));
  warmOnce.offer(vscode.window.activeTextEditor?.document);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) =>
      warmOnce.offer(editor?.document),
    ),
  );

  return { currentGraph: () => session.currentGraph() };
}

export function deactivate(): void {}
