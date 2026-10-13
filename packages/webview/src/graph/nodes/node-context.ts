import type { NodeId } from "@code-spider/core/types";
import { createContext } from "react";
import type { AppState } from "../../app/app-state.js";
import type { GraphState } from "../../view/types.js";
import type { NodeUi } from "./node-controls.js";

export type NodeActions = {
  onExpand: (nodeId: NodeId) => void;
  onCollapse: (nodeId: NodeId) => void;
  onUnpin: (nodeId: NodeId) => void;
  onOpen: (nodeId: NodeId) => void;
  onClose: (nodeId: NodeId) => void;
};

export type NodeContextValue = {
  graph: GraphState;
  ui: NodeUi;
  failures: AppState["failures"];
  onUnpin: NodeActions["onUnpin"];
};

/** Keeps React Flow's node data stable: boxes read what changes from here. */
export const NodeContext = createContext<NodeContextValue | undefined>(
  undefined,
);
