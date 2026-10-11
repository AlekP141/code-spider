import { useCallback, useEffect, useRef, type Dispatch } from "react";
import type { AppAction, AppState } from "../app-state.js";
import { layoutGraph } from "./layout.js";
import { tidyGraph } from "./tidy-graph.js";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lays out each pending centre slice with ELK, and offers Tidy for the graph on
 * screen. Stale results are discarded by the reducer, which matches the id of
 * the pending slice and the generation of the graph.
 */
export function useGraphLayout(
  state: AppState,
  dispatch: Dispatch<AppAction>,
): { tidy: () => void } {
  const { pending } = state;
  useEffect(() => {
    if (!pending) return;
    layoutGraph(pending.graph, pending.columnGap).then(
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

  const latest = useRef(state.view);
  useEffect(() => {
    latest.current = state.view;
  }, [state.view]);

  const tidy = useCallback(() => {
    tidyGraph(
      () => latest.current.current,
      () => latest.current.columnGap,
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
