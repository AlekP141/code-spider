import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core/types";
import type { EdgeStyle } from "../settings/edge-style.js";

export type Point = { x: number; y: number };

/** What one slice brought in; the key is the node it was fetched for. */
export type SliceRecord = { members: NodeId[]; edgeIds: string[] };

export type GraphState = {
  generation: number;
  /** Absolute tsconfig path, opaque to the webview. */
  project: string;
  focusId: NodeId;
  nodes: Record<NodeId, GraphNode>;
  edges: Record<string, GraphEdge>;
  /** The key `focusId` holds the centre's own slice. */
  slices: Record<NodeId, SliceRecord>;
  /** Top-left corners in flow coordinates. */
  positions: Record<NodeId, Point>;
  pinned: NodeId[];
  /** Nodes whose code is shown; absent in older saves, which means none. */
  open?: NodeId[];
  /** Goes up by one on any change to nodes, edges, pins or positions. */
  revision: number;
  /** The gap its positions were laid out with; absent in older saves. */
  columnGap?: number;
  /** The change counter when this graph's data was read; absent in older saves. */
  sourceVersion?: number;
};

export type ViewState = {
  version: 1;
  nextGeneration: number;
  columnGap: number;
  /** Absent in older saves: the default. */
  edgeStyle?: EdgeStyle;
  current: GraphState | undefined;
  history: GraphState[];
};
