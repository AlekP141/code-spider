import type { GraphSlice } from "@code-spider/core";

export type FocusResult = { slice: GraphSlice; repoRoot: string };

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

export type WorkerRequest = (WarmRequest | FocusRequestBody) & { id: number };

export type WorkerResponse =
  | { id: number; kind: "warmed" }
  | { id: number; kind: "focused"; result: FocusResult }
  | { id: number; kind: "failed"; message: string };
