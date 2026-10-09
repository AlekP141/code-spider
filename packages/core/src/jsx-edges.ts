import {
  Node,
  SyntaxKind,
  type JsxOpeningElement,
  type JsxSelfClosingElement,
} from "ts-morph";
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
import { propsTypeLabel } from "./labels.js";
import { buildGraphNode, rangeOf, type BuildContext } from "./node-builder.js";
import type { NodeId } from "./types.js";

type JsxElement = JsxSelfClosingElement | JsxOpeningElement;

export function collectJsxEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
  graph: Graph,
): void {
  for (const element of jsxElementsOf(target)) {
    if (!isIntrinsicTag(element.getTagNameNode())) {
      addJsxEdge(graph, element, focusId, ctx);
    }
  }
}

function jsxElementsOf(target: FocusTarget): JsxElement[] {
  return [
    ...target.declaration.getDescendantsOfKind(
      SyntaxKind.JsxSelfClosingElement,
    ),
    ...target.declaration.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ];
}

function isIntrinsicTag(tag: Node): boolean {
  if (Node.isJsxNamespacedName(tag)) return true;
  return Node.isIdentifier(tag) && /^[a-z]/.test(tag.getText());
}

function addJsxEdge(
  graph: Graph,
  element: JsxElement,
  focusId: NodeId,
  ctx: BuildContext,
): void {
  const tag = element.getTagNameNode();
  const displayName = displayNameOf(tag);
  const callSite = rangeOf(element);
  const declaration = resolveDeclaration(tag);

  if (!declaration) {
    addUnknown(graph, displayName, focusId, callSite, "jsx");
    return;
  }

  const supplies = isCallable(declaration) ? propsTypeLabel(declaration) : "";

  if (isExternalFile(declaration.getSourceFile())) {
    const node = externalNode(declaration, displayName);
    addNodeEdge(graph, node, focusId, "jsx", supplies, callSite);
    return;
  }

  const componentTarget = isCallable(declaration)
    ? nameableTarget(declaration)
    : undefined;
  if (!componentTarget) {
    addUnknown(graph, displayName, focusId, callSite, "jsx");
    return;
  }

  const node = buildGraphNode(
    componentTarget,
    classifyDeclaration(componentTarget.declaration),
    ctx,
  );
  addNodeEdge(graph, node, focusId, "jsx", supplies, callSite);
}
