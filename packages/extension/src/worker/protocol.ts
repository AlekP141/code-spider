import type { GraphSlice, NodeId } from "@code-spider/core";

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
  offset: number;
  changedFiles: string[];
};

export type SliceForNodeRequest = {
  kind: "sliceForNode";
  tsconfig: string;
  nodeId: NodeId;
  changedFiles: string[];
};

export type WorkerRequestBody =
  | WarmRequest
  | FocusRequestBody
  | SliceForNodeRequest;

export type WorkerRequest = WorkerRequestBody & { id: number };

export type WorkerResponse =
  | { id: number; kind: "warmed" }
  | { id: number; kind: "focused"; result: FocusResult }
  | { id: number; kind: "sliced"; result: ExpandResult }
  | { id: number; kind: "failed"; message: string };
