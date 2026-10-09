import type { GraphSlice, NodeId } from "@code-spider/core";

export type ExtensionToWebview =
  | { type: "slice"; slice: GraphSlice }
  | { type: "analysisError"; message: string }
  | { type: "busy"; busy: boolean }
  | { type: "indexing"; indexing: boolean };

/** `focus`, `expand` and `refresh` are in the spec's protocol; M3 handles them. */
export type WebviewToExtension =
  | { type: "ready" }
  | { type: "openInEditor"; nodeId: NodeId }
  | { type: "openCallSite"; edgeId: string }
  | { type: "focus"; nodeId: NodeId }
  | { type: "expand"; nodeId: NodeId }
  | { type: "refresh" };
