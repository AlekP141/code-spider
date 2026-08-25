export const VERSION = "0.0.0";

export type {
  NodeId,
  Range,
  NodeKind,
  GraphNode,
  EdgeType,
  GraphEdge,
  GraphSlice,
} from "./types.js";
export { makeNodeId, parseNodeId, toPosixPath } from "./node-id.js";
