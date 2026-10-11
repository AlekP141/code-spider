import { join } from "node:path";
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import * as vscode from "vscode";
import { ChangeTracker } from "./changes.js";
import { ColumnGapStore } from "./column-gap.js";
import { createDispatcher } from "./dispatch.js";
import {
  COMMAND_SHOW_GRAPH,
  COMMAND_SHOW_IN_CODE_SPIDER,
  SETTING_MAX_HEAP_MB,
} from "./ids.js";
import { JumpTable } from "./jump-table.js";
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
  /** The entry point a webview message reaches; tests drive the webview's requests here. */
  handleWebviewMessage(message: WebviewToExtension): Promise<void>;
};

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const workerPath = join(context.extensionPath, "dist", "worker.cjs");
  const worker = new WorkerClient(() =>
    spawnAnalysisWorker(workerPath, getMaxHeapMb()),
  );
  const revealer = new EditorRevealer();
  const jumpTable = new JumpTable();
  const panel = new GraphPanel(
    context.extensionUri,
    (message) => {
      dispatch(message).catch((error: unknown) => {
        notifier.error(
          `Code Spider could not handle that request: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    },
    () => jumpTable.clear(),
  );
  const statusBar = new IndexingStatusBar();
  const changes = new ChangeTracker();
  const session = new GraphSession({
    worker,
    panel,
    notifier,
    indexing: statusBar,
    changes,
    maxHeapMb: getMaxHeapMb,
    jumps: jumpTable,
  });
  const columnGap = new ColumnGapStore(context.globalState, (value) =>
    panel.post({ type: "settings", columnGap: value }),
  );
  const dispatch = createDispatcher({
    jumps: new JumpHandler(jumpTable, revealer),
    session,
    columnGap,
  });
  columnGap.publish();
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
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme === "file") changes.mark(document.uri.fsPath);
    }),
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
    handleWebviewMessage: (message) => dispatch(message),
  };
}

export function deactivate(): void {}
