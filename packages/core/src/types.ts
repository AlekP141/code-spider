export type NodeId = string;

export type Range = {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
};

export type NodeKind = "function" | "component" | "external" | "unknown";

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
};

export type EdgeType = "call" | "jsx" | "external";

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
