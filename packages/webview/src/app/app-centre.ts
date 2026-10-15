import type { GraphState } from "../view/types.js";
import type { AppState, FitRequest, PendingCentre } from "./app-state.js";

export function startCentre(state: AppState, graph: GraphState): AppState {
  return {
    ...state,
    error: undefined,
    pending: {
      id: state.nextPending,
      graph,
      columnGap: state.view.columnGap,
      testVisibility: state.testVisibility,
    },
    nextPending: state.nextPending + 1,
  };
}

export function refit(state: AppState, duration: number): FitRequest {
  return { token: state.fit.token + 1, duration };
}

/** A setting moved while ELK ran, so lay the same centre out again. */
export function relayoutPending(
  state: AppState,
  pending: PendingCentre,
): AppState {
  return {
    ...state,
    pending: {
      ...pending,
      id: state.nextPending,
      columnGap: state.view.columnGap,
      testVisibility: state.testVisibility,
    },
    nextPending: state.nextPending + 1,
  };
}
