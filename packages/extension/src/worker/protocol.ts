import type {
  GraphSlice,
  NodeId,
  PathInfo,
  PathProgress,
  PathRoute,
} from "@code-spider/core";
import type {
  FindPathRequest,
  FindPathResult,
  RefreshPath,
  ResolveEndRequest,
  ResolvedEnd,
} from "./path-protocol.js";

export type {
  FindPathRequest,
  FindPathResult,
  RefreshPath,
  ResolveEndRequest,
  ResolvedEnd,
  WorkerPathOutcome,
} from "./path-protocol.js";

export type FocusResult = {
  slice: GraphSlice;
  repoRoot: string;
  tsconfig: string;
};
export type ExpandResult = FocusResult;

export type WarmRequest = {
  kind: "warm";
  file: string;
  changedFiles: string[];
};

export type FocusRequestBody = {
  kind: "focus";
  file: string;
  line: number;
  character: number;
  changedFiles: string[];
};

export type SliceForNodeRequest = {
  kind: "sliceForNode";
  tsconfig: string;
  nodeId: NodeId;
  changedFiles: string[];
};

export type RefreshRequest = {
  kind: "refresh";
  tsconfig: string;
  focusId: NodeId;
  expanded: NodeId[];
  changedFiles: string[];
  path?: RefreshPath;
};

export type RefreshResult = {
  tsconfig: string;
  repoRoot: string;
  centre: GraphSlice | undefined;
  expansions: { nodeId: NodeId; slice: GraphSlice }[];
  route?: PathRoute;
  path?: PathInfo;
  pathStatus?: "gone" | "none" | "cancelled";
  pathStoppedBy?: "time";
};

export type WorkerRequestBody =
  | WarmRequest
  | FocusRequestBody
  | SliceForNodeRequest
  | RefreshRequest
  | ResolveEndRequest
  | FindPathRequest;

export type WorkerRequest = WorkerRequestBody & { id: number };

export type WorkerResponse =
  | { id: number; kind: "warmed" }
  | { id: number; kind: "focused"; result: FocusResult }
  | { id: number; kind: "sliced"; result: ExpandResult }
  | { id: number; kind: "refreshed"; result: RefreshResult }
  | { id: number; kind: "resolved"; result: ResolvedEnd | undefined }
  | { id: number; kind: "pathProgress"; progress: PathProgress }
  | { id: number; kind: "pathDone"; result: FindPathResult }
  | { id: number; kind: "failed"; message: string };
