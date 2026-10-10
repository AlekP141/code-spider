import type { GraphSlice, NodeId } from "@code-spider/core/types";

export type SliceMode =
  | { kind: "centre" }
  | { kind: "expansion"; nodeId: NodeId; generation: number };

export type ExtensionToWebview =
  | { type: "slice"; slice: GraphSlice; project: string; mode: SliceMode }
  | {
      type: "expandFailed";
      nodeId: NodeId;
      generation: number;
      message: string;
    }
  | { type: "analysisError"; message: string }
  | { type: "busy"; busy: boolean }
  | { type: "indexing"; indexing: boolean }
  | { type: "settings"; columnGap: number };

/** `refresh` is in the spec's protocol; M3b handles it. */
export type WebviewToExtension =
  | { type: "ready" }
  | { type: "openInEditor"; project: string; nodeId: NodeId }
  | { type: "openCallSite"; project: string; edgeId: string }
  | { type: "focus"; project: string; nodeId: NodeId }
  | { type: "expand"; project: string; nodeId: NodeId; generation: number }
  | { type: "setColumnGap"; value: number }
  | { type: "refresh" };
