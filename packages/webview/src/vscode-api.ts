import type { WebviewToExtension } from "./protocol.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtension): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let api: ReturnType<typeof acquireVsCodeApi> | undefined;

function vscode() {
  api ??= acquireVsCodeApi();
  return api;
}

export function postToExtension(message: WebviewToExtension): void {
  vscode().postMessage(message);
}

/** What `saveState` stored before the webview was reloaded, if anything. */
export function getSavedState(): unknown {
  return vscode().getState();
}

export function saveState(state: unknown): void {
  vscode().setState(state);
}
