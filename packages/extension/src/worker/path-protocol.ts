import type { NodeId, PathLimits, PathOutcome } from "@code-spider/core";

export type ResolveEndRequest = {
  kind: "resolveEnd";
  file: string;
  line: number;
  character: number;
  changedFiles: string[];
};

export type FindPathRequest = {
  kind: "findPath";
  tsconfig: string;
  fromId: NodeId;
  toId: NodeId;
  limits: PathLimits;
  cancel: SharedArrayBuffer;
  changedFiles: string[];
};

export type RefreshPath = {
  endId: NodeId;
  limits: PathLimits;
  cancel: SharedArrayBuffer;
};

export type ResolvedEnd = {
  tsconfig: string;
  repoRoot: string;
  nodeId: NodeId;
  name: string;
  isTest: boolean;
};

export type WorkerPathOutcome =
  | PathOutcome
  | { status: "gone"; nodeId: NodeId };

export type FindPathResult = {
  tsconfig: string;
  repoRoot: string;
  outcome: WorkerPathOutcome;
};
