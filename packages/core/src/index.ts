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
export {
  analyzeFocus,
  analyzeFocusAt,
  expandNode,
  type AnalyzeAtRequest,
  type AnalyzeRequest,
} from "./analyze.js";
export { NodeNotFoundError } from "./errors.js";
export { positionToOffset } from "./position.js";
export {
  findTsconfig,
  loadProject,
  warmProject,
  Project,
} from "./project.js";
export { CODE_PREVIEW_MAX_LINES } from "./node-builder.js";
export { MAX_CALLERS } from "./callers.js";
