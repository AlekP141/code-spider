import { useCallback, useEffect, useRef, type Dispatch } from "react";
import type { AppAction, AppState } from "../../app/app-state.js";
import { hiddenIds, visibleGraph } from "../../view/test-visibility.js";
import { layoutFor } from "./path-layout.js";
import { tidyGraph } from "./tidy-graph.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lays out each pending centre slice (a path graph by columns, any other with
 * ELK), and offers Tidy for the graph on screen. Stale results are discarded
 * by the reducer, which matches the id of the pending slice and the generation
 * of the graph.
 */
export function useGraphLayout(
  state: AppState,
  dispatch: Dispatch<AppAction>,
): { tidy: () => void } {
  const { pending } = state;
  useEffect(() => {
    if (!pending) return;
    const { graph, columnGap, testVisibility } = pending;
    const shown = visibleGraph(graph, hiddenIds(graph, testVisibility));
    layoutFor(shown, columnGap).then(
      (positions) =>
        dispatch({ type: "centreLaidOut", id: pending.id, positions }),
      (error: unknown) =>
        dispatch({
          type: "centreLayoutFailed",
          id: pending.id,
          message: messageOf(error),
        }),
    );
  }, [pending, dispatch]);

  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);

  const tidy = useCallback(() => {
    tidyGraph(
      () => {
        const { view, testVisibility } = latest.current;
        const graph = view.current;
        return graph && visibleGraph(graph, hiddenIds(graph, testVisibility));
      },
      () => latest.current.view.columnGap,
      layoutFor,
    ).then(
      (outcome) => {
        if (outcome) dispatch({ type: "tidied", ...outcome });
      },
      (error: unknown) =>
        dispatch({ type: "tidyFailed", message: messageOf(error) }),
    );
  }, [dispatch]);

  return { tidy };
}
