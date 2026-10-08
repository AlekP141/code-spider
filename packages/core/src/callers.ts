import { Node, type Identifier, type PropertyAccessExpression } from "ts-morph";
import { classifyDeclaration } from "./classify.js";
import {
  isCallable,
  toFocusTarget,
  type CallableDeclaration,
  type FocusTarget,
} from "./focus.js";
import { returnTypeLabel } from "./labels.js";
import { buildGraphNode, rangeOf, type BuildContext } from "./node-builder.js";
import type { GraphEdge, GraphNode, NodeId } from "./types.js";

/** Spec §6: a logging helper can have hundreds of callers; cap the slice. */
export const MAX_CALLERS = 50;

/**
 * Callers come from the language service's reference index (the data behind
 * Find All References), not a whole-project index of our own.
 */
export function collectCallerEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean } {
  const supplies = returnTypeLabel(target.declaration).text;

  const nodes = new Map<NodeId, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  let truncated = false;

  for (const ref of referencesInOrder(target.nameNode)) {
    if (ref === target.nameNode || !isCallReference(ref)) continue;

    const caller = nameableCaller(ref);
    if (!caller) continue;

    const node = buildGraphNode(
      caller,
      classifyDeclaration(caller.declaration),
      ctx,
    );
    if (node.id === focusId) continue;

    const key = `${focusId}|${node.id}`;
    if (edges.has(key)) continue;

    if (edges.size >= MAX_CALLERS) {
      truncated = true;
      break;
    }

    nodes.set(node.id, node);
    edges.set(key, {
      id: `${focusId}->${node.id}`,
      from: focusId,
      to: node.id,
      kind: "call",
      supplies,
      callSite: rangeOf(ref),
      resolved: true,
    });
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    truncated,
  };
}

/** Sorted by path then position, so the kept callers are deterministic. */
function referencesInOrder(nameNode: Identifier): Node[] {
  return nameNode.findReferencesAsNodes().sort(compareLocation);
}

function compareLocation(a: Node, b: Node): number {
  const fileA = a.getSourceFile().getFilePath();
  const fileB = b.getSourceFile().getFilePath();
  if (fileA !== fileB) return fileA < fileB ? -1 : 1;
  return a.getStart() - b.getStart();
}

const CALL_APPLY = new Set(["call", "apply"]);

/**
 * True when the reference invokes the symbol: `f()`, `obj.f()`, `f.call(...)`,
 * `f.apply(...)` or `obj.f.call(...)`. Imports, type positions and other
 * members such as `f.toString()` or `f.bind(...)()` are not calls.
 */
function isCallReference(ref: Node): boolean {
  const parent = ref.getParent();
  if (Node.isCallExpression(parent)) return parent.getExpression() === ref;
  if (!Node.isPropertyAccessExpression(parent)) return false;
  if (parent.getExpression() === ref) return isCallApply(parent);
  return isInvoked(parent) || isCallApplyOn(parent);
}

function isInvoked(expr: Node): boolean {
  const parent = expr.getParent();
  return Node.isCallExpression(parent) && parent.getExpression() === expr;
}

function isCallApply(access: PropertyAccessExpression): boolean {
  return CALL_APPLY.has(access.getName()) && isInvoked(access);
}

function isCallApplyOn(expr: Node): boolean {
  const parent = expr.getParent();
  return (
    Node.isPropertyAccessExpression(parent) &&
    parent.getExpression() === expr &&
    isCallApply(parent)
  );
}

/**
 * The nearest enclosing callable that can be named in the graph. Anonymous
 * callbacks are skipped, so their calls belong to the function passing them.
 */
function nameableCaller(ref: Node): FocusTarget | undefined {
  for (
    let fn = ref.getFirstAncestor(isCallable);
    fn;
    fn = fn.getFirstAncestor(isCallable)
  ) {
    const target = tryFocusTarget(fn);
    if (target) return target;
  }
  return undefined;
}

function tryFocusTarget(
  declaration: CallableDeclaration,
): FocusTarget | undefined {
  try {
    return toFocusTarget(declaration, declaration.getSourceFile());
  } catch {
    return undefined;
  }
}
