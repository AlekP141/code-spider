import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import { ChangeTracker } from "./changes.js";
import { TrailingDebounce } from "./debounce.js";

export function createSourceChanges(
  post: (message: ExtensionToWebview) => void,
  delayMs: number,
): { changes: ChangeTracker; dispose(): void } {
  const debounce = new TrailingDebounce<number>(delayMs, (version) =>
    post({ type: "sourceChanged", version }),
  );
  const changes = new ChangeTracker((version) => debounce.push(version));
  return { changes, dispose: () => debounce.dispose() };
}
