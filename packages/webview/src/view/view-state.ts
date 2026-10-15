import { COLUMN_GAP } from "../settings/column-gap.js";
import { DEFAULT_EDGE_STYLE, type EdgeStyle } from "../settings/edge-style.js";
import type { GraphState, ViewState } from "./types.js";

export const HISTORY_LIMIT = 20;

export function createView(
  columnGap: number = COLUMN_GAP.default,
  edgeStyle: EdgeStyle = DEFAULT_EDGE_STYLE,
): ViewState {
  return {
    version: 1,
    nextGeneration: 1,
    columnGap,
    edgeStyle,
    current: undefined,
    history: [],
  };
}

export function canGoBack(view: ViewState): boolean {
  return view.history.length > 0;
}

function hasExpansions(graph: GraphState): boolean {
  return Object.keys(graph.slices).some((key) => key !== graph.focusId);
}

/**
 * Re-centring on the same node would rebuild it, so Back need not keep it.
 * A path graph cannot be rebuilt that way, and replacing one must keep it.
 */
function isRecoverable(previous: GraphState, next: GraphState): boolean {
  return (
    !previous.path &&
    !next.path &&
    previous.project === next.project &&
    previous.focusId === next.focusId &&
    !hasExpansions(previous) &&
    previous.pinned.length === 0
  );
}

/**
 * Makes a freshly laid-out graph current. The graph it replaces goes onto the
 * history unless it is trivially recoverable, and the new one gets a new
 * generation so answers still in flight for the old one are dropped.
 */
export function commitCentre(view: ViewState, graph: GraphState): ViewState {
  const previous = view.current;
  const keep = previous && !isRecoverable(previous, graph);
  return {
    ...view,
    nextGeneration: view.nextGeneration + 1,
    current: { ...graph, generation: view.nextGeneration },
    history: keep
      ? [...view.history, previous].slice(-HISTORY_LIMIT)
      : view.history,
  };
}

export function goBack(view: ViewState): ViewState {
  const restored = view.history.at(-1);
  if (!restored) return view;
  return {
    ...view,
    nextGeneration: view.nextGeneration + 1,
    current: { ...restored, generation: view.nextGeneration },
    history: view.history.slice(0, -1),
  };
}

export function replaceCurrent(view: ViewState, graph: GraphState): ViewState {
  return { ...view, current: graph };
}
