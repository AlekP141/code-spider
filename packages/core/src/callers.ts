import {
  Node,
  type CallExpression,
  type JsxOpeningElement,
  type NewExpression,
  type JsxSelfClosingElement,
} from "ts-morph";
import { aliasDeclaredBy, MAX_ALIAS_DEPTH } from "./bound-functions.js";
import { classifyDeclaration } from "./classify.js";
import { nearestNameableTarget, type FocusTarget } from "./focus.js";
import { propsTypeLabel, returnTypeLabel, signatureLabel } from "./labels.js";
import { edgeId } from "./node-id.js";
import {
  buildGraphNode,
  buildModuleNode,
  rangeOf,
  type BuildContext,
} from "./node-builder.js";
import { passSiteOf } from "./passing.js";
import { findReferenceNodes } from "./references.js";
import type { GraphEdge, GraphNode, NodeId } from "./types.js";

/** Spec §6: a logging helper can have hundreds of callers; cap the slice. */
export const MAX_CALLERS = 50;

type UseSite = { kind: "call" | "jsx" | "passes"; node: Node };

/**
 * Callers come from TypeScript's reference finder (the data behind Find All
 * References), not a whole-project index of our own. A reference counts
 * when it is a call target, a rendered JSX tag, or the function passed as a
 * value (see passSiteOf).
 */
export function collectCallerEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean } {
  const supplies = {
    call: returnTypeLabel(target.declaration).text,
    jsx: propsTypeLabel(target.declaration),
    passes: signatureLabel(target.declaration),
  };

  const nodes = new Map<NodeId, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  let truncated = false;

  for (const ref of referencesInOrder(target.nameNode)) {
    if (ref === target.nameNode) continue;
    const site = useSiteOf(ref);
    if (!site) continue;

    const caller = nearestNameableTarget(ref);
    const node = caller
      ? buildGraphNode(caller, classifyDeclaration(caller.declaration), ctx)
      : buildModuleNode(ref.getSourceFile(), ctx);
    if (node.id === focusId) continue;

    const key = `${node.id}|${site.kind}`;
    if (edges.has(key)) continue;

    if (edges.size >= MAX_CALLERS) {
      truncated = true;
      break;
    }

    nodes.set(node.id, node);
    edges.set(key, {
      id: edgeId(focusId, node.id, site.kind),
      from: focusId,
      to: node.id,
      kind: site.kind,
      supplies: supplies[site.kind],
      callSite: rangeOf(site.node),
      resolved: true,
    });
  }

  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    truncated,
  };
}

function useSiteOf(ref: Node): UseSite | undefined {
  const call = callOf(ref);
  if (call) return { kind: "call", node: call };
  const element = renderOf(ref);
  if (element) return { kind: "jsx", node: element };
  const passed = passSiteOf(ref);
  return passed && { kind: "passes", node: passed };
}

/**
 * The element whose tag is `ref`, as in `<Ref />` or `<ns.Ref>`. Closing tags
 * are not renders.
 */
function renderOf(
  ref: Node,
): JsxOpeningElement | JsxSelfClosingElement | undefined {
  const parent = ref.getParent();
  const tag =
    Node.isPropertyAccessExpression(parent) && parent.getNameNode() === ref
      ? parent
      : ref;
  const element = tag.getParent();
  if (
    !Node.isJsxOpeningElement(element) &&
    !Node.isJsxSelfClosingElement(element)
  ) {
    return undefined;
  }
  return element.getTagNameNode() === tag ? element : undefined;
}

/** Sorted by path then position, so the kept callers are deterministic. */
function referencesInOrder(nameNode: Node): Node[] {
  return referencesThroughAliases(nameNode, 0).sort(compareLocation);
}

/** References, with each `const alias = it` replaced by the alias's own. */
function referencesThroughAliases(nameNode: Node, depth: number): Node[] {
  return findReferenceNodes(nameNode).flatMap((ref) => {
    const alias = aliasDeclaredBy(ref);
    if (!alias || depth >= MAX_ALIAS_DEPTH) return [ref];
    return referencesThroughAliases(alias.getNameNode(), depth + 1);
  });
}

function compareLocation(a: Node, b: Node): number {
  const fileA = a.getSourceFile().getFilePath();
  const fileB = b.getSourceFile().getFilePath();
  if (fileA !== fileB) return fileA < fileB ? -1 : 1;
  return a.getStart() - b.getStart();
}

const CALL_APPLY = new Set(["call", "apply"]);

/**
 * The call a reference invokes: `f()`, `new F()`, `obj.f()`, `f.call(...)`,
 * `f.apply(...)` or `obj.f.call(...)`. Imports, type positions and other
 * members such as `f.toString()` are not calls.
 */
function callOf(ref: Node): CallExpression | NewExpression | undefined {
  const direct = invokerOf(ref) ?? callApplyOn(ref);
  if (direct) return direct;
  const parent = ref.getParent();
  if (
    Node.isPropertyAccessExpression(parent) &&
    parent.getExpression() !== ref
  ) {
    return invokerOf(parent) ?? callApplyOn(parent);
  }
  return undefined;
}

/** The call that invokes `expr` directly, as in `expr()` or `new expr()`. */
function invokerOf(expr: Node): CallExpression | NewExpression | undefined {
  const parent = expr.getParent();
  if (!Node.isCallExpression(parent) && !Node.isNewExpression(parent)) {
    return undefined;
  }
  return parent.getExpression() === expr ? parent : undefined;
}

/** For `expr.call(...)` or `expr.apply(...)`, the call of that member. */
function callApplyOn(
  expr: Node,
): CallExpression | NewExpression | undefined {
  const parent = expr.getParent();
  if (!Node.isPropertyAccessExpression(parent)) return undefined;
  if (parent.getExpression() !== expr) return undefined;
  return CALL_APPLY.has(parent.getName()) ? invokerOf(parent) : undefined;
}
