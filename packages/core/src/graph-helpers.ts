import type { Node } from "ts-morph";
import { externalModuleOf } from "./classify.js";
import {
  isCallable,
  toFocusTarget,
  type CallableDeclaration,
  type FocusTarget,
} from "./focus.js";
import { returnTypeLabel } from "./labels.js";
import type {
  EdgeType,
  GraphEdge,
  GraphNode,
  NodeId,
  NodeKind,
  Range,
} from "./types.js";

export type Graph = {
  nodes: Map<NodeId, GraphNode>;
  edges: Map<string, GraphEdge>;
};

const EMPTY_RANGE: Range = {
  startLine: 0,
  startColumn: 0,
  endLine: 0,
  endColumn: 0,
};

/** Follow import aliases to the real declaration. Returns undefined when unresolvable. */
export function resolveDeclaration(expression: Node): Node | undefined {
  const symbol = expression.getSymbol();
  if (!symbol) return undefined;
  const real = symbol.getAliasedSymbol() ?? symbol;
  return real.getDeclarations()[0];
}

/**
 * toFocusTarget throws for callables it cannot name (anonymous default
 * exports, private `#names`, computed keys). Those must still be kept as
 * unresolved nodes rather than aborting the whole graph.
 */
export function nameableTarget(
  declaration: CallableDeclaration,
): FocusTarget | undefined {
  try {
    return toFocusTarget(declaration, declaration.getSourceFile());
  } catch {
    return undefined;
  }
}

export function addNodeEdge(
  graph: Graph,
  node: GraphNode,
  focusId: NodeId,
  kind: EdgeType,
  supplies: string,
  callSite: Range,
  resolved = true,
): void {
  putNode(graph.nodes, node);
  putEdge(graph.edges, {
    id: `${node.id}->${focusId}`,
    from: node.id,
    to: focusId,
    kind,
    supplies,
    callSite,
    resolved,
  });
}

export function addUnknown(
  graph: Graph,
  displayName: string,
  focusId: NodeId,
  callSite: Range,
  kind: EdgeType,
): void {
  const node = placeholderNode(
    `unknown#${displayName}`,
    "unknown",
    displayName,
    "",
  );
  addNodeEdge(graph, node, focusId, kind, "", callSite, false);
}

export function externalNode(
  declaration: Node,
  displayName: string,
): GraphNode {
  const module = externalModuleOf(declaration.getSourceFile().getFilePath());
  return placeholderNode(
    `external:${module}#${displayName}`,
    "external",
    displayName,
    safeReturnType(declaration),
  );
}

function placeholderNode(
  id: NodeId,
  kind: NodeKind,
  name: string,
  returnType: string,
): GraphNode {
  return {
    id,
    kind,
    name,
    file: "",
    range: EMPTY_RANGE,
    inputType: "",
    returnType,
    isAsync: false,
    lineCount: 0,
    codePreview: "",
  };
}

function safeReturnType(declaration: Node): string {
  return isCallable(declaration)
    ? returnTypeLabel(declaration).text
    : "unknown";
}

function putNode(map: Map<NodeId, GraphNode>, node: GraphNode): void {
  if (!map.has(node.id)) map.set(node.id, node);
}

/** Dedupe on (from, to, kind) — the first call site wins. */
function putEdge(map: Map<string, GraphEdge>, edge: GraphEdge): void {
  const key = `${edge.from}|${edge.to}|${edge.kind}`;
  if (!map.has(key)) map.set(key, edge);
}
