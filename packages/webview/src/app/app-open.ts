import type { NodeId } from "@code-spider/core/types";
import { closeNode, openNode } from "../view/open-close.js";
import { replaceCurrent } from "../view/view-state.js";
import type { AppState } from "./app-state.js";

export function openBox(state: AppState, nodeId: NodeId): AppState {
  const current = state.view.current;
  if (!current) return state;
  const opened = openNode(
    current,
    nodeId,
    current.columnGap ?? state.view.columnGap,
  );
  if (opened === current) return state;
  return { ...state, view: replaceCurrent(state.view, opened) };
}

export function closeBox(state: AppState, nodeId: NodeId): AppState {
  const current = state.view.current;
  if (!current) return state;
  const closed = closeNode(current, nodeId);
  if (closed === current) return state;
  return { ...state, view: replaceCurrent(state.view, closed) };
}
