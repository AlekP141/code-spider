export const VERSION = "0.0.0";

export type {
  NodeId,
  Range,
  NodeKind,
  GraphNode,
  EdgeType,
  GraphEdge,
  GraphSlice,
  PathBox,
  PathSummary,
  PathInfo,
  PathRoute,
  PathProgress,
  PathLimits,
} from "./types.js";
export { makeNodeId, parseNodeId, toPosixPath } from "./nodes/node-id.js";
export {
  analyzeFocus,
  analyzeFocusAt,
  expandNode,
  type AnalyzeAtRequest,
  type AnalyzeRequest,
} from "./analyze.js";
export {
  findPaths,
  type PathOutcome,
  type PathRequest,
} from "./path/find-paths.js";
export { identifyAt, type ResolvedFunction } from "./path/ends.js";
export { createStopSignal, type StopSignal } from "./path/signal.js";
export { NodeNotFoundError } from "./errors.js";
export { positionToOffset } from "./focus/position.js";
export {
  findTsconfig,
  loadProject,
  warmProject,
  Project,
} from "./project/project.js";
export { CODE_PREVIEW_MAX_LINES } from "./nodes/node-builder.js";
export { MAX_CALLERS } from "./callers/callers.js";
