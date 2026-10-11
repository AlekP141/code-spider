import type { GraphSlice, NodeId } from "@code-spider/core/types";
import type { EdgeStyle } from "./edge-style.js";

export type SliceMode =
  | { kind: "centre"; sourceVersion: number }
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
  | { type: "settings"; columnGap: number; edgeStyle: EdgeStyle }
  | {
      type: "refreshed";
      project: string;
      generation: number;
      sourceVersion: number;
      centre: GraphSlice;
      expansions: { nodeId: NodeId; slice: GraphSlice }[];
    }
  | { type: "refreshFailed"; generation: number; message: string }
  | { type: "sourceChanged"; version: number };

export type WebviewToExtension =
  | { type: "ready" }
  | { type: "openInEditor"; project: string; nodeId: NodeId }
  | { type: "openCallSite"; project: string; edgeId: string }
  | { type: "focus"; project: string; nodeId: NodeId }
  | { type: "expand"; project: string; nodeId: NodeId; generation: number }
  | { type: "setColumnGap"; value: number }
  | { type: "setEdgeStyle"; value: EdgeStyle }
  | {
      type: "refresh";
      project: string;
      generation: number;
      focusId: NodeId;
      expanded: NodeId[];
    };
