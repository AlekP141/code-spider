import { SyntaxKind } from "ts-morph";
import { classifyDeclaration } from "./classify.js";
import { isExternalFile } from "./externals.js";
import {
  belongsTo,
  isCallable,
  nameableTarget,
  type FocusTarget,
} from "./focus.js";
import {
  addNodeEdge,
  resolveDeclaration,
  type Graph,
} from "./graph-helpers.js";
import { signatureLabel } from "./labels.js";
import { buildGraphNode, rangeOf, type BuildContext } from "./node-builder.js";
import { passSiteOf } from "./passing.js";
import type { NodeId } from "./types.js";

/**
 * Repo functions the focus hands over as values, such as event handlers. They
 * are never called in the focus's own body, so call edges alone miss them.
 */
export function collectPassEdges(
  target: FocusTarget,
  focusId: NodeId,
  ctx: BuildContext,
  graph: Graph,
): void {
  for (const ref of target.declaration.getDescendantsOfKind(
    SyntaxKind.Identifier,
  )) {
    const site = passSiteOf(ref);
    if (!site || !belongsTo(ref, target)) continue;

    const declaration = resolveDeclaration(ref);
    if (!declaration || !isCallable(declaration)) continue;
    if (isExternalFile(declaration.getSourceFile())) continue;
    const passed = nameableTarget(declaration);
    if (!passed) continue;

    const node = buildGraphNode(passed, classifyDeclaration(declaration), ctx);
    const supplies = signatureLabel(passed.declaration);
    addNodeEdge(graph, node, focusId, "passes", supplies, rangeOf(site));
  }
}
