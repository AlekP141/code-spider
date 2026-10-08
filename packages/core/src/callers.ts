import { Node } from "ts-morph";
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
 * Callers of the focus node, found through the TypeScript language service's
 * reference index (the same data behind Find All References) rather than a
 * whole-project index of our own.
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

  for (const ref of target.nameNode.findReferencesAsNodes()) {
    // The declaration's own name is not a caller.
    if (ref === target.nameNode) continue;
    if (!isCallReference(ref)) continue;

    const enclosing = ref.getFirstAncestor(isCallable);
    if (!enclosing) continue;

    const callerTarget = nameableCaller(enclosing);
    if (!callerTarget) continue;

    const node = buildGraphNode(
      callerTarget,
      classifyDeclaration(enclosing),
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

/** True when the reference is the callee, not an import or a type position. */
function isCallReference(ref: Node): boolean {
  const parent = ref.getParent();
  if (!parent) return false;
  if (Node.isCallExpression(parent)) return parent.getExpression() === ref;
  if (Node.isPropertyAccessExpression(parent)) {
    const grand = parent.getParent();
    return Node.isCallExpression(grand) && grand.getExpression() === parent;
  }
  return false;
}

/** Anonymous callbacks cannot be named in the graph, so they are skipped. */
function nameableCaller(
  enclosing: CallableDeclaration,
): FocusTarget | undefined {
  try {
    return toFocusTarget(enclosing, enclosing.getSourceFile());
  } catch {
    return undefined;
  }
}
