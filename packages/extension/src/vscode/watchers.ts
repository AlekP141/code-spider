import * as vscode from "vscode";
import {
  CONFIG_WATCH_GLOB,
  SOURCE_WATCH_GLOB,
} from "../changes/watched-paths.js";

export function registerChangeWatchers(
  onChange: (fsPath: string) => void,
): vscode.Disposable {
  const disposables = [SOURCE_WATCH_GLOB, CONFIG_WATCH_GLOB].flatMap((glob) => {
    const watcher = vscode.workspace.createFileSystemWatcher(glob);
    return [
      watcher,
      watcher.onDidCreate((uri) => onChange(uri.fsPath)),
      watcher.onDidChange((uri) => onChange(uri.fsPath)),
      watcher.onDidDelete((uri) => onChange(uri.fsPath)),
    ];
  });
  return vscode.Disposable.from(...disposables);
}
