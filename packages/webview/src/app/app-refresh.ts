import type { AppState } from "./app-state.js";
import { isWorking } from "./app-working.js";
import type { ExtensionToWebview } from "../host/protocol.js";
import { rebuildGraph } from "../view/refresh.js";
import { replaceCurrent } from "../view/view-state.js";

type RefreshedMessage = Extract<ExtensionToWebview, { type: "refreshed" }>;
type FailedMessage = Extract<ExtensionToWebview, { type: "refreshFailed" }>;

export function canRefresh(state: AppState): boolean {
  return (
    state.view.current !== undefined &&
    !isWorking(state) &&
    state.loading.length === 0 &&
    !state.refreshing
  );
}

export function showsChangeDot(
  state: Pick<AppState, "view" | "latestSourceVersion">,
): boolean {
  const drawn = state.view.current?.sourceVersion;
  return (
    drawn !== undefined &&
    state.latestSourceVersion !== undefined &&
    drawn < state.latestSourceVersion
  );
}

export function noteSourceChanged(state: AppState, version: number): AppState {
  const latest = Math.max(state.latestSourceVersion ?? version, version);
  return latest === state.latestSourceVersion
    ? state
    : { ...state, latestSourceVersion: latest };
}

export function startRefresh(state: AppState): AppState {
  return canRefresh(state) ? { ...state, refreshing: true } : state;
}

export function applyRefreshed(
  state: AppState,
  answer: RefreshedMessage,
): AppState {
  const current = state.view.current;
  if (
    current?.generation !== answer.generation ||
    current.project !== answer.project ||
    current.focusId !== answer.centre.focusId
  ) {
    return state;
  }
  const { graph, added } = rebuildGraph(
    current,
    answer,
    current.columnGap ?? state.view.columnGap,
    state.testVisibility,
  );
  const applied = {
    ...state,
    view: replaceCurrent(state.view, graph),
    refreshing: false,
  };
  if (added.length === 0) return applied;
  const stillFading = state.entering.ids.filter((id) =>
    Object.hasOwn(graph.nodes, id),
  );
  const token = state.nextToken;
  return {
    ...applied,
    entering: { ids: [...stillFading, ...added], token },
    nextToken: token + 1,
  };
}

export function failRefresh(
  state: AppState,
  message: FailedMessage,
): AppState {
  if (state.view.current?.generation !== message.generation) return state;
  return { ...state, error: message.message, refreshing: false };
}
