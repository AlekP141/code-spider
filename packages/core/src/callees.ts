import { SyntaxKind, type CallExpression, type Node } from "ts-morph";
import { classifyDeclaration } from "./classify.js";
import { isExternalFile } from "./externals.js";
import { isCallable, nameableTarget, type FocusTarget } from "./focus.js";
import {
  addNodeEdge,
  addUnknown,
  displayNameOf,
  externalNode,
  resolveDeclaration,
  type Graph,
} from "./graph-helpers.js";
import { collectJsxEdges } from "./jsx-edges.js";
import { buildGraphNode, rangeOf, type BuildContext } from "./node-builder.js";
import type { GraphEdge, GraphNode, NodeId } from "./types.js";

/** Follow import aliases to the real declaration. Returns undefined when unresolvable. */
export function resolveCallTarget(call: CallExpression): Node | undefined {
  return resolveDeclaration(call.getExpression());
}

export function collectCalleeEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const graph: Graph = { nodes: new Map(), edges: new Map() };

  for (const call of target.declaration.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    addCallEdge(graph, call, focusId, ctx);
  }
  collectJsxEdges(target, focusId, ctx, graph);

  return { nodes: [...graph.nodes.values()], edges: [...graph.edges.values()] };
}

function addCallEdge(
  graph: Graph,
  call: CallExpression,
  focusId: NodeId,
  ctx: BuildContext,
): void {
  const callSite = rangeOf(call);
  const displayName = displayNameOf(call.getExpression());
  const declaration = resolveCallTarget(call);

  if (!declaration) {
    addUnknown(graph, displayName, focusId, callSite, "call");
    return;
  }

  if (isExternalFile(declaration.getSourceFile())) {
    const node = externalNode(declaration, displayName);
    addNodeEdge(graph, node, focusId, "external", node.returnType, callSite);
    return;
  }

  const calleeTarget = isCallable(declaration)
    ? nameableTarget(declaration)
    : undefined;
  if (!calleeTarget) {
    addUnknown(graph, displayName, focusId, callSite, "call");
    return;
  }

  const node = buildGraphNode(
    calleeTarget,
    classifyDeclaration(declaration),
    ctx,
  );
  addNodeEdge(graph, node, focusId, "call", node.returnType, callSite);
}
