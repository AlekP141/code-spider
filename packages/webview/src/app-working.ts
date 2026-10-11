import type { AppState } from "./app-state.js";

/** Busy in the worker, or a centre slice still waiting for ELK. */
export function isWorking(state: AppState): boolean {
  return state.busy || state.pending !== undefined;
}
