export type NodeId = string;

export type Range = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type NodeKind =
  | "function"
  | "component"
  | "module"
  | "external"
  | "unknown";

export type GraphNode = {
  id: NodeId;
  kind: NodeKind;
  name: string;
  file: string;
  range: Range;
  inputType: string;
  returnType: string;
  isAsync: boolean;
  lineCount: number;
  codePreview: string;
  /** True when the node's file is test code (see isTestPath); absent otherwise. */
  isTest?: true;
  /** Set by the extension from the git diff (uncommitted, or against the main branch), not by the analyser. */
  change?: "added" | "modified";
};

export type EdgeType = "call" | "jsx" | "external" | "passes";

export type GraphEdge = {
  id: string;
  from: NodeId;
  to: NodeId;
  kind: EdgeType;
  supplies: string;
  callSite: Range;
  resolved: boolean;
};

export type GraphSlice = {
  focusId: NodeId;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
};

export type PathBox = { id: NodeId; column: number };

export type PathSummary = {
  routes: number;
  /** Counting stopped early: routes is a lower bound. */
  routesCapped: boolean;
  /** Route boxes the box cap cut. */
  leftOut: number;
  stoppedBy?: "time";
  /** Climbs finished. */
  checked: number;
};

export type PathInfo = {
  /** B; A is the graph's focusId. */
  endId: NodeId;
  /** Route boxes, nearest first. */
  boxes: PathBox[];
  /** Route links. */
  edgeIds: string[];
  summary: PathSummary;
};

export type PathRoute = { nodes: GraphNode[]; edges: GraphEdge[] };

export type PathProgress = {
  checked: number;
  routes: number;
  routesCapped: boolean;
};

export type PathLimits = { timeLimitMs: number; maxBoxes: number };
