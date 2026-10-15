import { basename } from "node:path";
import type { GraphSlice, NodeId, PathRoute } from "@code-spider/core";
import type { ExtensionToWebview } from "@code-spider/webview/protocol";
import type { DocumentsPort, JumpRegistry, Notifier } from "../ports.js";
import { annotateSlice } from "../diff/annotate.js";
import type { ChangeMap } from "../diff/parse-diff.js";
import type { FocusResult, RefreshResult } from "../worker/protocol.js";

export const CENTRE_GONE_MESSAGE =
  "The function at the centre of this graph no longer exists. Put the cursor in a function and press Shift+Alt+2.";

export const PATH_ENDS_GONE_MESSAGE =
  "The start or the end of this path no longer exists. Put the cursor in a function and press Shift+Alt+2.";

export const REFRESH_CANCELLED_MESSAGE =
  "Refresh cancelled. The graph is unchanged.";

export function noPathRefreshMessage(
  from: string,
  to: string,
  timedOut: boolean,
): string {
  return `No path found any more from ${from} to ${to}${timedOut ? " within the time limit" : ""}. The graph on screen is unchanged.`;
}

export function routeSlice(focusId: NodeId, route: PathRoute): GraphSlice {
  return { focusId, nodes: route.nodes, edges: route.edges, truncated: false };
}

export function annotateRoute(route: PathRoute, marks: ChangeMap): PathRoute {
  const { nodes } = annotateSlice(routeSlice("", route), marks);
  return { nodes, edges: route.edges };
}

/** Marks every slice a refresh returned, as every other slice is marked. */
export function annotateRefresh(
  analysed: RefreshResult,
  marks: ChangeMap,
): RefreshResult {
  const { centre, route, expansions } = analysed;
  return {
    ...analysed,
    centre: centre && annotateSlice(centre, marks),
    expansions: expansions.map(({ nodeId, slice }) => ({
      nodeId,
      slice: annotateSlice(slice, marks),
    })),
    ...(route && { route: annotateRoute(route, marks) }),
  };
}

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
    ...(result.route &&
      result.path && { route: result.route, path: result.path }),
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
  if (result.route) {
    const slice = routeSlice(centre.focusId, result.route);
    jumps.add(tsconfig, { slice, repoRoot, tsconfig });
  }
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
