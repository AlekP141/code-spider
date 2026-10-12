import {
  SyntaxKind,
  type CallExpression,
  type NewExpression,
  type Node,
} from "ts-morph";
import { classifyDeclaration } from "../nodes/classify.js";
import { isExternalFile } from "../nodes/externals.js";
import {
  belongsTo,
  isCallable,
  nameableTarget,
  type FocusTarget,
} from "../focus/focus.js";
import {
  addNodeEdge,
  addUnknown,
  displayNameOf,
  externalNode,
  resolveDeclaration,
  type Graph,
} from "./graph-helpers.js";
import { collectJsxEdges } from "./jsx-edges.js";
import {
  buildGraphNode,
  rangeOf,
  type BuildContext,
} from "../nodes/node-builder.js";
import { collectPassEdges } from "./pass-edges.js";
import type { GraphEdge, GraphNode, NodeId } from "../types.js";

type Invocation = CallExpression | NewExpression;

/** Follow import aliases to the real declaration. Returns undefined when unresolvable. */
export function resolveCallTarget(call: Invocation): Node | undefined {
  return resolveDeclaration(call.getExpression());
}

export function collectCalleeEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const graph: Graph = { nodes: new Map(), edges: new Map() };

  const invocations: Invocation[] = [
    ...target.declaration.getDescendantsOfKind(SyntaxKind.CallExpression),
    ...target.declaration.getDescendantsOfKind(SyntaxKind.NewExpression),
  ].sort((a, b) => a.getStart() - b.getStart());
  for (const call of invocations) {
    if (belongsTo(call, target)) addCallEdge(graph, call, focusId, ctx);
  }
  collectJsxEdges(target, focusId, ctx, graph);
  collectPassEdges(target, focusId, ctx, graph);

  return { nodes: [...graph.nodes.values()], edges: [...graph.edges.values()] };
}

function addCallEdge(
  graph: Graph,
  call: Invocation,
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
