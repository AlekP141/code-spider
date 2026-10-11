import type { GraphSlice } from "@code-spider/core";
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import type { JumpRegistry } from "./ports.js";
import type { FocusResult, RefreshResult } from "./worker/protocol.js";

export const CENTRE_GONE_MESSAGE =
  "The function at the centre of this graph no longer exists. Put the cursor in a function and press Shift+Alt+Q.";

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
