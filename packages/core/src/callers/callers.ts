import {
  Node,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
  type SourceFile,
  type ts,
} from "ts-morph";
import { aliasDeclaredBy, MAX_ALIAS_DEPTH } from "../focus/bound-functions.js";
import { classifyDeclaration } from "../nodes/classify.js";
import {
  nearestNameableTarget,
  type CallableDeclaration,
  type FocusTarget,
} from "../focus/focus.js";
import {
  propsTypeLabel,
  returnTypeLabel,
  signatureLabel,
} from "../nodes/labels.js";
import { edgeId } from "../nodes/node-id.js";
import {
  buildGraphNode,
  buildModuleNode,
  rangeOf,
  type BuildContext,
} from "../nodes/node-builder.js";
import { passSiteOf } from "../callees/passing.js";
import { callOf } from "./call-of.js";
import { hostedFunctionHits, injectedHitsFrom } from "./injected-hits.js";
import { findReferenceNodes } from "./references.js";
import type { GraphEdge, GraphNode, NodeId } from "../types.js";

/** Spec §6: a logging helper can have hundreds of callers; cap the slice. */
export const MAX_CALLERS = 50;

type UseSite = { kind: "call" | "jsx" | "passes" | "injected"; node: Node };

export type CallerHit = {
  ref: Node;
  kind: UseSite["kind"];
  site: Node;
  /** Undefined when the use sits outside every named function. */
  caller: FocusTarget | undefined;
  sourceFile: SourceFile;
};

/**
 * Every use of the function behind `nameNode`, in reference order, one at a
 * time so a consumer can stop early. A reference counts when it is a call
 * target, a rendered JSX tag or the function passed as a value (see
 * passSiteOf); the name itself is not a use.
 */
export function* callerHits(
  nameNode: Node,
  token?: ts.CancellationToken,
): Iterable<CallerHit> {
  for (const ref of referencesInOrder(nameNode, token)) {
    if (ref === nameNode) continue;
    const site = useSiteOf(ref);
    if (!site) continue;
    yield {
      ref,
      kind: site.kind,
      site: site.node,
      caller: nearestNameableTarget(ref),
      sourceFile: ref.getSourceFile(),
    };
    yield* injectedHitsFrom(ref, token);
  }
}

/**
 * callerHits plus the callbacks written inside the function, which are
 * called by whatever receives them (see hostedFunctionHits).
 */
export function* allCallerHits(
  target: FocusTarget,
  token?: ts.CancellationToken,
): Iterable<CallerHit> {
  yield* callerHits(target.nameNode, token);
  yield* hostedFunctionHits(target, token);
}

export function suppliesLabel(
  declaration: CallableDeclaration,
  kind: UseSite["kind"],
): string {
  if (kind === "call" || kind === "injected") {
    return returnTypeLabel(declaration).text;
  }
  return kind === "jsx"
    ? propsTypeLabel(declaration)
    : signatureLabel(declaration);
}

/**
 * Callers come from TypeScript's reference finder (the data behind Find All
 * References), not a whole-project index of our own.
 */
export function collectCallerEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
): { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean } {
  const supplies: Partial<Record<UseSite["kind"], string>> = {};
  const entries = new Map<string, { node: GraphNode; edge: GraphEdge }>();
  let realKept = 0;
  let truncated = false;

  for (const hit of allCallerHits(target)) {
    const { caller, kind } = hit;
    const node = caller
      ? buildGraphNode(caller, classifyDeclaration(caller.declaration), ctx)
      : buildModuleNode(hit.sourceFile, ctx);
    if (node.id === focusId) continue;

    const key = `${node.id}|${kind}`;
    if (entries.has(key)) continue;

    if (!node.isTest && realKept >= MAX_CALLERS) {
      truncated = true;
      break;
    }
    if (!node.isTest) realKept++;

    entries.set(key, {
      node,
      edge: {
        id: edgeId(focusId, node.id, kind),
        from: focusId,
        to: node.id,
        kind,
        supplies: (supplies[kind] ??= suppliesLabel(target.declaration, kind)),
        callSite: rangeOf(hit.site),
        resolved: true,
      },
    });
  }

  const all = [...entries.values()];
  const room = MAX_CALLERS - realKept;
  const tests = all.filter((e) => e.node.isTest);
  const keptTests = new Set(tests.slice(0, room));
  truncated ||= tests.length > room;
  const kept = all.filter((e) => !e.node.isTest || keptTests.has(e));

  return {
    nodes: [...new Map(kept.map((e) => [e.node.id, e.node])).values()],
    edges: kept.map((e) => e.edge),
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
function referencesInOrder(
  nameNode: Node,
  token?: ts.CancellationToken,
): Node[] {
  return referencesThroughAliases(nameNode, 0, token).sort(compareLocation);
}

/** References, with each `const alias = it` replaced by the alias's own. */
function referencesThroughAliases(
  nameNode: Node,
  depth: number,
  token?: ts.CancellationToken,
): Node[] {
  return findReferenceNodes(nameNode, token).flatMap((ref) => {
    const alias = aliasDeclaredBy(ref);
    if (!alias || depth >= MAX_ALIAS_DEPTH) return [ref];
    return referencesThroughAliases(alias.getNameNode(), depth + 1, token);
  });
}

function compareLocation(a: Node, b: Node): number {
  const fileA = a.getSourceFile().getFilePath();
  const fileB = b.getSourceFile().getFilePath();
  if (fileA !== fileB) return fileA < fileB ? -1 : 1;
  return a.getStart() - b.getStart();
}
