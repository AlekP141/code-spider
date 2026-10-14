import { basename } from "node:path";
import type { GraphSlice } from "@code-spider/core";
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import type { DocumentsPort, JumpRegistry, Notifier } from "../ports.js";
import type { FocusResult, RefreshResult } from "../worker/protocol.js";

export const CENTRE_GONE_MESSAGE =
  "The function at the centre of this graph no longer exists. Put the cursor in a function and press Ctrl+Alt+S.";

export function refreshFailedMessage(
  generation: number,
  message: string,
): ExtensionToWebview {
  return { type: "refreshFailed", generation, message };
}

export function refreshedMessage(
  generation: number,
  sourceVersion: number,
  result: RefreshResult,
  centre: GraphSlice,
): ExtensionToWebview {
  return {
    type: "refreshed",
    project: result.tsconfig,
    generation,
    sourceVersion,
    centre,
    expansions: result.expansions,
  };
}

/** Records every returned slice for jumping; returns the new centre graph. */
export function recordRefresh(
  jumps: JumpRegistry,
  result: RefreshResult,
  centre: GraphSlice,
): FocusResult {
  const { repoRoot, tsconfig } = result;
  const graph = { slice: centre, repoRoot, tsconfig };
  jumps.add(tsconfig, graph);
  for (const { slice } of result.expansions) {
    jumps.add(tsconfig, { slice, repoRoot, tsconfig });
  }
  return graph;
}

export function unsavedEditsMessage(
  files: readonly string[],
): string | undefined {
  if (files.length === 0) return undefined;
  const subject =
    files.length === 1
      ? `${basename(files[0] ?? "")} has`
      : `${files.length} files have`;
  return `Code Spider: ${subject} unsaved changes; the graph shows the saved version.`;
}

export function noticeUnsavedEdits(
  project: string,
  jumps: JumpRegistry,
  documents: DocumentsPort,
  notifier: Notifier,
): void {
  const unsaved = documents.unsavedFiles();
  if (unsaved.length === 0) return;
  const known = new Set(jumps.files(project));
  const message = unsavedEditsMessage(unsaved.filter((f) => known.has(f)));
  if (message) notifier.status(message);
}
