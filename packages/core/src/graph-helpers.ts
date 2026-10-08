import { Node } from "ts-morph";
import { boundFunctionOf } from "./bound-functions.js";
import { externalModuleOf } from "./externals.js";
import { isCallable } from "./focus.js";
import { returnTypeLabel } from "./labels.js";
import { edgeId } from "./node-id.js";
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

const MAX_NAME_LENGTH = 60;

/** Callee or tag text as a one-line name: `api\n  .list` becomes `api.list`. */
export function displayNameOf(expression: Node): string {
  const text = expression
    .getText()
    .replace(/\s*(\??\.)\s*/g, "$1")
    .replace(/\s+/g, " ");
  return text.length > MAX_NAME_LENGTH
    ? `${text.slice(0, MAX_NAME_LENGTH - 1)}…`
    : text;
}

/**
 * Follow import aliases to the real declaration. Returns undefined when unresolvable.
 * Consts resolve to the function they are bound to (see boundFunctionOf).
 */
export function resolveDeclaration(expression: Node): Node | undefined {
  const symbol = expression.getSymbol();
  if (!symbol) return undefined;
  const real = symbol.getAliasedSymbol() ?? symbol;
  const declaration = real.getDeclarations()[0];
  return declaration && functionInitializerOf(declaration);
}

function functionInitializerOf(declaration: Node): Node {
  if (!Node.isVariableDeclaration(declaration)) return declaration;
  return boundFunctionOf(declaration) ?? declaration;
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
    id: edgeId(node.id, focusId, kind),
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
  const module = externalModuleOf(declaration.getSourceFile());
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
