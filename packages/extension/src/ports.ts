import type { NodeId } from "@code-spider/core";
import type { ChangeMap } from "./diff/parse-diff.js";
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import type {
  ExpandResult,
  FocusResult,
  RefreshResult,
} from "./worker/protocol.js";

export interface AnalysisPort {
  warm(file: string, changedFiles: string[]): Promise<void>;
  focus(
    file: string,
    line: number,
    character: number,
    changedFiles: string[],
  ): Promise<FocusResult>;
  sliceForNode(
    tsconfig: string,
    nodeId: NodeId,
    changedFiles: string[],
  ): Promise<ExpandResult>;
  refresh(
    tsconfig: string,
    focusId: NodeId,
    expanded: NodeId[],
    changedFiles: string[],
  ): Promise<RefreshResult>;
}

export interface PanelPort {
  show(): void;
  isOpen(): boolean;
  post(message: ExtensionToWebview): void;
}

/** Remembers what was sent to the panel so later clicks can be resolved. */
export interface JumpRegistry {
  add(project: string, result: FocusResult): void;
  has(project: string): boolean;
  /** Absolute paths of the files of every node known for the project. */
  files(project: string): string[];
}

export interface DiffPort {
  /** Uncommitted changes, keyed by path relative to `repoRoot`. */
  changes(repoRoot: string): Promise<ChangeMap>;
}

export interface DocumentsPort {
  /** Absolute paths of open `file` documents with unsaved edits. */
  unsavedFiles(): string[];
}

export interface Notifier {
  warn(message: string): void;
  error(message: string): void;
  status(message: string): void;
}

export interface IndexingIndicator {
  set(active: boolean): void;
}
