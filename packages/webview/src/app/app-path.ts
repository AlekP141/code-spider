import type {
  PathFoundMessage,
  PathMark,
  PathSearch,
} from "../host/protocol.js";
import { graphFromPath } from "../view/path-graph.js";
import { startCentre } from "./app-centre.js";
import type { AppState } from "./app-state.js";

export function withPathStart(
  state: AppState,
  mark: PathMark | undefined,
): AppState {
  return { ...state, pathStart: mark };
}

/** Cancelling belongs to one search: it ends with it or when another starts. */
export function withPathSearch(
  state: AppState,
  search: PathSearch | undefined,
): AppState {
  const sameSearch = search !== undefined && search.id === state.pathSearch?.id;
  return {
    ...state,
    pathSearch: search,
    cancelling: state.cancelling && sameSearch,
  };
}

export function requestPathCancel(state: AppState): AppState {
  return state.pathSearch ? { ...state, cancelling: true } : state;
}

export function startPathCentre(
  state: AppState,
  message: PathFoundMessage,
): AppState {
  return startCentre(state, {
    ...graphFromPath(message, message.project),
    sourceVersion: message.sourceVersion,
  });
}
