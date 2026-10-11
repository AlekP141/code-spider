import type { NodeId } from "@code-spider/core/types";
import type { ExtensionToWebview } from "./protocol.js";
import {
  applyRefreshed,
  failRefresh,
  noteSourceChanged,
  startRefresh,
} from "./app-refresh.js";
import { applySettings, withColumnGap, withEdgeStyle } from "./app-settings.js";
import {
  acceptAnswer,
  collapseExpanded,
  expireEntering,
  expireFailure,
  failExpansion,
  resetTransient,
  startExpansion,
  unpinBox,
} from "./app-walk.js";
import { isWorking } from "./app-working.js";
import type { EdgeStyle } from "./edge-style.js";
import type { Rect } from "./graph/placement.js";
import { graphFromSlice, pinNodes, setPositions } from "./view/graph-state.js";
import { isViewState } from "./view/persist.js";
import type { GraphState, Point, ViewState } from "./view/types.js";
import {
  canGoBack,
  commitCentre,
  createView,
  goBack,
  replaceCurrent,
} from "./view/view-state.js";

/** A centre slice waiting for ELK; the old graph stays on screen meanwhile. */
export type PendingCentre = {
  id: number;
  graph: GraphState;
  columnGap: number;
};

export type FitRequest = { token: number; duration: number };

export type AppState = {
  view: ViewState;
  error: string | undefined;
  busy: boolean;
  indexing: boolean;
  pending: PendingCentre | undefined;
  nextPending: number;
  fit: FitRequest;
  /** Transient walk state: never part of the persisted view. */
  loading: NodeId[];
  failures: Record<NodeId, { message: string; token: number }>;
  entering: { ids: NodeId[]; token: number };
  nextToken: number;
  reveal: { token: number; rect: Rect } | undefined;
  /** A refresh request is out; never persisted. */
  refreshing: boolean;
  /** The newest `sourceChanged` seen; never persisted. */
  latestSourceVersion: number | undefined;
  /** Only the first `settings` message after each load is applied. */
  settingsApplied: boolean;
};

export type LocalAction =
  | { type: "centreLaidOut"; id: number; positions: Record<NodeId, Point> }
  | { type: "centreLayoutFailed"; id: number; message: string }
  | { type: "dragStopped"; positions: Record<NodeId, Point> }
  | {
      type: "tidied";
      generation: number;
      columnGap: number;
      positions: Record<NodeId, Point>;
    }
  | { type: "tidyFailed"; message: string }
  | { type: "expandStarted" | "collapsed" | "unpinned"; nodeId: NodeId }
  | { type: "failureExpired"; nodeId: NodeId; token: number }
  | { type: "enteringExpired"; token: number }
  | { type: "back" }
  | { type: "refreshStarted" }
  | { type: "columnGapChanged"; value: number }
  | { type: "edgeStyleChanged"; value: EdgeStyle };

export type AppAction = ExtensionToWebview | LocalAction;

export { isWorking };

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
    loading: [],
    failures: {},
    entering: { ids: [], token: 0 },
    nextToken: 1,
    reveal: undefined,
    refreshing: false,
    latestSourceVersion: undefined,
    settingsApplied: false,
  };
}

type SliceMessage = Extract<ExtensionToWebview, { type: "slice" }>;

function startCentre(
  state: AppState,
  message: SliceMessage,
  sourceVersion: number,
): AppState {
  return {
    ...state,
    error: undefined,
    pending: {
      id: state.nextPending,
      graph: {
        ...graphFromSlice(message.slice, message.project),
        sourceVersion,
      },
      columnGap: state.view.columnGap,
    },
    nextPending: state.nextPending + 1,
  };
}

function refit(state: AppState, duration: number): FitRequest {
  return { token: state.fit.token + 1, duration };
}

/** The slider moved while ELK ran, so lay the same centre out again. */
function relayoutPending(state: AppState, pending: PendingCentre): AppState {
  return {
    ...state,
    pending: {
      ...pending,
      id: state.nextPending,
      columnGap: state.view.columnGap,
    },
    nextPending: state.nextPending + 1,
  };
}

function goBackOnce(state: AppState): AppState {
  if (isWorking(state) || !canGoBack(state.view)) return state;
  return {
    ...resetTransient(state),
    view: goBack(state.view),
    error: undefined,
    fit: refit(state, 0),
  };
}

export function reduceApp(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "slice":
      return action.mode.kind === "centre"
        ? startCentre(state, action, action.mode.sourceVersion)
        : acceptAnswer(state, action);
    case "analysisError":
      return { ...state, error: action.message };
    case "busy":
      return {
        ...state,
        busy: action.busy,
        refreshing: action.busy && state.refreshing,
        error: action.busy ? undefined : state.error,
      };
    case "indexing":
      return { ...state, indexing: action.indexing };
    case "expandFailed":
      return failExpansion(state, action);
    case "refreshed":
      return applyRefreshed(state, action);
    case "refreshFailed":
      return failRefresh(state, action);
    case "sourceChanged":
      return noteSourceChanged(state, action.version);
    case "settings":
      return applySettings(state, action);
    case "centreLaidOut": {
      if (state.pending?.id !== action.id) return state;
      if (state.pending.columnGap !== state.view.columnGap) {
        return relayoutPending(state, state.pending);
      }
      const { graph: laidOut, columnGap } = state.pending;
      const graph = { ...laidOut, positions: action.positions, columnGap };
      return {
        ...resetTransient(state),
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
        view: replaceCurrent(state.view, {
          ...setPositions(current, action.positions),
          columnGap: action.columnGap,
        }),
        fit: refit(state, 250),
      };
    }
    case "tidyFailed":
      return { ...state, error: LAYOUT_FAILED + action.message };
    case "expandStarted":
      return startExpansion(state, action.nodeId);
    case "collapsed":
      return collapseExpanded(state, action.nodeId);
    case "unpinned":
      return unpinBox(state, action.nodeId);
    case "failureExpired":
      return expireFailure(state, action.nodeId, action.token);
    case "enteringExpired":
      return expireEntering(state, action.token);
    case "back":
      return goBackOnce(state);
    case "refreshStarted":
      return startRefresh(state);
    case "columnGapChanged":
      return withColumnGap(state, action.value);
    case "edgeStyleChanged":
      return withEdgeStyle(state, action.value);
  }
}
