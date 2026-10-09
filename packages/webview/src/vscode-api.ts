import type { WebviewToExtension } from "./protocol.js";

declare function acquireVsCodeApi(): {
  postMessage(message: WebviewToExtension): void;
};

let api: ReturnType<typeof acquireVsCodeApi> | undefined;

export function postToExtension(message: WebviewToExtension): void {
  api ??= acquireVsCodeApi();
  api.postMessage(message);
}
