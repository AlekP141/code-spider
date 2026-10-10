import type { NodeId } from "@code-spider/core/types";
import type { ExtensionToWebview } from "./protocol.js";
import { acceptExpansion } from "./view/expansion.js";
import { graphFromSlice, pinNodes, setPositions } from "./view/graph-state.js";
import { isViewState } from "./view/persist.js";
import type { GraphState, Point, ViewState } from "./view/types.js";
import { commitCentre, createView, replaceCurrent } from "./view/view-state.js";

/** A centre slice waiting for ELK; the old graph stays on screen meanwhile. */
export type PendingCentre = {
  id: number;
  graph: GraphState;
  columnGap: number;
};

/** The canvas refits whenever `token` changes. */
export type FitRequest = { token: number; duration: number };

export type AppState = {
  view: ViewState;
  error: string | undefined;
  busy: boolean;
  indexing: boolean;
  pending: PendingCentre | undefined;
  nextPending: number;
  fit: FitRequest;
};

export type LocalAction =
  | { type: "centreLaidOut"; id: number; positions: Record<NodeId, Point> }
  | { type: "centreLayoutFailed"; id: number; message: string }
  | { type: "dragStopped"; positions: Record<NodeId, Point> }
  | { type: "tidied"; generation: number; positions: Record<NodeId, Point> }
  | { type: "tidyFailed"; message: string };

export type AppAction = ExtensionToWebview | LocalAction;

const LAYOUT_FAILED = "Could not lay out the graph: ";

export function createAppState(saved: unknown): AppState {
  return {
    view: isViewState(saved) ? saved : createView(),
    error: undefined,
    busy: false,
    indexing: false,
    pending: undefined,
    nextPending: 1,
    fit: { token: 0, duration: 0 },
  };
}

type SliceMessage = Extract<ExtensionToWebview, { type: "slice" }>;

function startCentre(state: AppState, message: SliceMessage): AppState {
  return {
    ...state,
    error: undefined,
    pending: {
      id: state.nextPending,
      graph: graphFromSlice(message.slice, message.project),
      columnGap: state.view.columnGap,
    },
    nextPending: state.nextPending + 1,
  };
}

function mergeAnswer(state: AppState, message: SliceMessage): AppState {
  const { mode } = message;
  if (mode.kind !== "expansion") return state;
  const { view } = acceptExpansion(
    state.view,
    { slice: message.slice, project: message.project, mode },
    state.view.columnGap,
  );
  return view === state.view ? state : { ...state, view };
}

function refit(state: AppState, duration: number): FitRequest {
  return { token: state.fit.token + 1, duration };
}

export function reduceApp(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "slice":
      return action.mode.kind === "centre"
        ? startCentre(state, action)
        : mergeAnswer(state, action);
    case "analysisError":
      return { ...state, error: action.message };
    case "busy":
      return {
        ...state,
        busy: action.busy,
        error: action.busy ? undefined : state.error,
      };
    case "indexing":
      return { ...state, indexing: action.indexing };
    case "expandFailed":
    case "settings":
      return state;
    case "centreLaidOut": {
      if (state.pending?.id !== action.id) return state;
      const graph = { ...state.pending.graph, positions: action.positions };
      return {
        ...state,
        view: commitCentre(state.view, graph),
        pending: undefined,
        fit: refit(state, 0),
      };
    }
    case "centreLayoutFailed":
      if (state.pending?.id !== action.id) return state;
      return {
        ...state,
        pending: undefined,
        error: LAYOUT_FAILED + action.message,
      };
    case "dragStopped": {
      const current = state.view.current;
      if (!current) return state;
      const pinned = pinNodes(current, action.positions);
      return { ...state, view: replaceCurrent(state.view, pinned) };
    }
    case "tidied": {
      const current = state.view.current;
      if (current?.generation !== action.generation) return state;
      return {
        ...state,
        view: replaceCurrent(
          state.view,
          setPositions(current, action.positions),
        ),
        fit: refit(state, 250),
      };
    }
    case "tidyFailed":
      return { ...state, error: LAYOUT_FAILED + action.message };
  }
}
