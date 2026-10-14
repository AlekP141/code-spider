import type { NodeId } from "@code-spider/core/types";
import type { ChangeKind } from "../host/protocol.js";
import { withChangeMarks } from "../view/change-marks.js";
import type { GraphState } from "../view/types.js";
import type { AppState, PendingCentre } from "./app-state.js";

type Marks = Record<NodeId, ChangeKind>;

function recolourPending(
  pending: PendingCentre | undefined,
  recolour: (graph: GraphState) => GraphState,
): PendingCentre | undefined {
  if (!pending) return pending;
  const graph = recolour(pending.graph);
  return graph === pending.graph ? pending : { ...pending, graph };
}

/** Recolours every graph of the project; no box moves and nothing is gated. */
export function applyChangeMarks(
  state: AppState,
  message: { project: string; marks: Marks },
): AppState {
  const recolour = (graph: GraphState): GraphState =>
    graph.project === message.project
      ? withChangeMarks(graph, message.marks)
      : graph;
  const { current, history } = state.view;
  const nextCurrent = current && recolour(current);
  const recoloured = history.map(recolour);
  const nextHistory = recoloured.some((graph, i) => graph !== history[i])
    ? recoloured
    : history;
  const pending = recolourPending(state.pending, recolour);
  const viewChanged = nextCurrent !== current || nextHistory !== history;
  if (!viewChanged && pending === state.pending) return state;
  return {
    ...state,
    view: viewChanged
      ? { ...state.view, current: nextCurrent, history: nextHistory }
      : state.view,
    pending,
  };
}
