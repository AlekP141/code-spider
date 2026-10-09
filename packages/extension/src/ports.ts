import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import type { FocusResult } from "./worker/protocol.js";

export interface AnalysisPort {
  warm(file: string, changedFiles: string[]): Promise<void>;
  focus(
    file: string,
    offset: number,
    changedFiles: string[],
  ): Promise<FocusResult>;
}

export interface PanelPort {
  show(): void;
  post(message: ExtensionToWebview): void;
}

export interface Notifier {
  warn(message: string): void;
  error(message: string): void;
}

export interface IndexingIndicator {
  set(active: boolean): void;
}
