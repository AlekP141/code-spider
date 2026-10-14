import { normaliseTestVisibility } from "../settings/test-visibility.js";
import { placeUnpositioned } from "../view/place-unpositioned.js";
import { forgetHidden } from "../view/test-visibility.js";
import type { GraphState } from "../view/types.js";
import type { AppState } from "./app-state.js";

/**
 * Hiding makes every graph forget its hidden boxes; showing places every box
 * that has no position. The current graph's revision always goes up on a flip
 * so a Tidy in progress runs again on what is now visible.
 */
export function withTestVisibility(state: AppState, raw: unknown): AppState {
  const testVisibility = normaliseTestVisibility(raw);
  const apply = (graph: GraphState): GraphState =>
    testVisibility === "hide"
      ? forgetHidden(graph, testVisibility)
      : placeUnpositioned(graph, graph.columnGap ?? state.view.columnGap);
  const { current, history } = state.view;
  const applied = current && apply(current);
  const raised =
    current && applied && testVisibility !== state.testVisibility
      ? {
          ...applied,
          revision: Math.max(applied.revision, current.revision + 1),
        }
      : applied;
  const nextHistory = history.map(apply);
  const historyChanged = nextHistory.some((graph, i) => graph !== history[i]);
  if (
    testVisibility === state.testVisibility &&
    raised === current &&
    !historyChanged
  ) {
    return state;
  }
  return {
    ...state,
    testVisibility,
    view: {
      ...state.view,
      current: raised,
      history: historyChanged ? nextHistory : history,
    },
  };
}
