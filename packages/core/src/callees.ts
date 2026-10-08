import { SyntaxKind, type CallExpression, type Node } from "ts-morph";
import {
  classifyDeclaration,
  externalModuleOf,
  isExternalPath,
} from "./classify.js";
import {
  isCallable,
  toFocusTarget,
  type CallableDeclaration,
  type FocusTarget,
} from "./focus.js";
import { returnTypeLabel } from "./labels.js";
import { buildGraphNode, rangeOf, type BuildContext } from "./node-builder.js";
import type { GraphEdge, GraphNode, NodeId, Range } from "./types.js";

const EMPTY_RANGE: Range = {
  startLine: 0,
  startColumn: 0,
  endLine: 0,
  endColumn: 0,
};

/** Follow import aliases to the real declaration. Returns undefined when unresolvable. */
export function resolveCallTarget(call: CallExpression): Node | undefined {
  const symbol = call.getExpression().getSymbol();
  if (!symbol) return undefined;
  const real = symbol.getAliasedSymbol() ?? symbol;
  return real.getDeclarations()[0];
}

export function collectCalleeEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<NodeId, GraphNode>();
  const edges = new Map<string, GraphEdge>();

  for (const call of target.declaration.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    const callSite = rangeOf(call);
    const declaration = resolveCallTarget(call);

    if (!declaration) {
      addUnknown(nodes, edges, call, focusId, callSite);
      continue;
    }

    const filePath = declaration.getSourceFile().getFilePath();

    if (isExternalPath(filePath)) {
      const displayName = call.getExpression().getText();
      const id = `external:${externalModuleOf(filePath)}#${displayName}`;
      const returnType = safeReturnType(declaration);
      putNode(nodes, {
        id,
        kind: "external",
        name: displayName,
        file: "",
        range: EMPTY_RANGE,
        inputType: "",
        returnType,
        isAsync: false,
        lineCount: 0,
        codePreview: "",
      });
      putEdge(edges, {
        id: `${id}->${focusId}`,
        from: id,
        to: focusId,
        kind: "external",
        supplies: returnType,
        callSite,
        resolved: true,
      });
      continue;
    }

    if (!isCallable(declaration)) {
      addUnknown(nodes, edges, call, focusId, callSite);
      continue;
    }

    const calleeTarget = nameableTarget(declaration);
    if (!calleeTarget) {
      addUnknown(nodes, edges, call, focusId, callSite);
      continue;
    }

    const node = buildGraphNode(
      calleeTarget,
      classifyDeclaration(declaration),
      ctx,
    );
    putNode(nodes, node);
    putEdge(edges, {
      id: `${node.id}->${focusId}`,
      from: node.id,
      to: focusId,
      kind: "call",
      supplies: node.returnType,
      callSite,
      resolved: true,
    });
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/**
 * toFocusTarget throws for callables it cannot name (anonymous default
 * exports, private `#names`, computed keys). Those calls must still be kept
 * as unresolved nodes rather than aborting the whole graph.
 */
function nameableTarget(
  declaration: CallableDeclaration,
): FocusTarget | undefined {
  try {
    return toFocusTarget(declaration, declaration.getSourceFile());
  } catch {
    return undefined;
  }
}

function safeReturnType(declaration: Node): string {
  return isCallable(declaration)
    ? returnTypeLabel(declaration).text
    : "unknown";
}

function addUnknown(
  nodes: Map<NodeId, GraphNode>,
  edges: Map<string, GraphEdge>,
  call: CallExpression,
  focusId: NodeId,
  callSite: Range,
): void {
  const displayName = call.getExpression().getText();
  const id = `unknown#${displayName}`;
  putNode(nodes, {
    id,
    kind: "unknown",
    name: displayName,
    file: "",
    range: EMPTY_RANGE,
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount: 0,
    codePreview: "",
  });
  putEdge(edges, {
    id: `${id}->${focusId}`,
    from: id,
    to: focusId,
    kind: "call",
    supplies: "",
    callSite,
    resolved: false,
  });
}

function putNode(map: Map<NodeId, GraphNode>, node: GraphNode): void {
  if (!map.has(node.id)) map.set(node.id, node);
}

/** Dedupe on (from, to, kind) — the first call site wins. */
function putEdge(map: Map<string, GraphEdge>, edge: GraphEdge): void {
  const key = `${edge.from}|${edge.to}|${edge.kind}`;
  if (!map.has(key)) map.set(key, edge);
}
