import type { NodeId } from "@code-spider/core/types";
import type { AppState } from "./app-state.js";
import { revealRect } from "../graph/viewport/reveal.js";
import type { ExtensionToWebview } from "../host/protocol.js";
import { acceptExpansion } from "../view/expansion.js";
import { collapseNode, unpinNode } from "../view/graph-state.js";
import { forgetHidden } from "../view/test-visibility.js";
import { replaceCurrent } from "../view/view-state.js";

type SliceMessage = Extract<ExtensionToWebview, { type: "slice" }>;
type FailedMessage = Extract<ExtensionToWebview, { type: "expandFailed" }>;

function without<T>(record: Record<NodeId, T>, nodeId: NodeId) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => key !== nodeId),
  );
}

export function resetTransient(state: AppState): AppState {
  return {
    ...state,
    loading: [],
    failures: {},
    entering: { ids: [], token: state.entering.token },
    reveal: undefined,
    refreshing: false,
  };
}

export function startExpansion(state: AppState, nodeId: NodeId): AppState {
  if (state.loading.includes(nodeId)) return state;
  return {
    ...state,
    loading: [...state.loading, nodeId],
    failures: without(state.failures, nodeId),
  };
}

export function acceptAnswer(state: AppState, message: SliceMessage): AppState {
  const { mode } = message;
  if (mode.kind !== "expansion") return state;
  const { view, added } = acceptExpansion(
    state.view,
    { slice: message.slice, project: message.project, mode },
    state.view.current?.columnGap ?? state.view.columnGap,
    state.testVisibility,
  );
  if (view === state.view) return state;
  const loading = state.loading.filter((id) => id !== mode.nodeId);
  const graph = view.current;
  if (!graph || added.length === 0) return { ...state, view, loading };
  const stillFading = state.entering.ids.filter((id) =>
    Object.hasOwn(graph.nodes, id),
  );
  const ids = [...stillFading, ...added];
  const rect = revealRect(graph, ids);
  if (!rect) return { ...state, view, loading };
  const token = state.nextToken;
  return {
    ...state,
    view,
    loading,
    entering: { ids, token },
    reveal: { token, rect },
    nextToken: token + 1,
  };
}

export function failExpansion(
  state: AppState,
  message: FailedMessage,
): AppState {
  const current = state.view.current;
  if (current?.generation !== message.generation) return state;
  if (!Object.hasOwn(current.nodes, message.nodeId)) return state;
  const token = state.nextToken;
  return {
    ...state,
    loading: state.loading.filter((id) => id !== message.nodeId),
    failures: {
      ...state.failures,
      [message.nodeId]: { message: message.message, token },
    },
    nextToken: token + 1,
  };
}

export function expireFailure(
  state: AppState,
  nodeId: NodeId,
  token: number,
): AppState {
  if (state.failures[nodeId]?.token !== token) return state;
  return { ...state, failures: without(state.failures, nodeId) };
}

export function expireEntering(state: AppState, token: number): AppState {
  if (state.entering.token !== token || state.entering.ids.length === 0) {
    return state;
  }
  return { ...state, entering: { ids: [], token } };
}

export function collapseExpanded(state: AppState, nodeId: NodeId): AppState {
  const current = state.view.current;
  if (!current) return state;
  const cut = collapseNode(current, nodeId);
  if (cut === current) return state;
  const collapsed = forgetHidden(cut, state.testVisibility);
  const stays = (id: NodeId) => Object.hasOwn(collapsed.nodes, id);
  return {
    ...state,
    view: replaceCurrent(state.view, collapsed),
    loading: state.loading.filter(stays),
    failures: Object.fromEntries(
      Object.entries(state.failures).filter(([id]) => stays(id)),
    ),
  };
}

export function unpinBox(state: AppState, nodeId: NodeId): AppState {
  const current = state.view.current;
  if (!current) return state;
  const unpinned = unpinNode(current, nodeId);
  if (unpinned === current) return state;
  return { ...state, view: replaceCurrent(state.view, unpinned) };
}
