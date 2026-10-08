import { join } from "node:path";
import { Node, type Project, type SourceFile } from "ts-morph";
import { bindingOf, isFunctionValue } from "./bound-functions.js";
import { collectCalleeEdges } from "./callees.js";
import { collectCallerEdges } from "./callers.js";
import { classifyDeclaration } from "./classify.js";
import {
  isCallable,
  resolveFocus,
  toFocusTarget,
  type CallableDeclaration,
  type FocusTarget,
} from "./focus.js";
import { buildGraphNode, type BuildContext } from "./node-builder.js";
import { parseNodeId } from "./node-id.js";
import type { GraphSlice, NodeId } from "./types.js";

export type AnalyzeRequest = {
  /** Absolute path to the focused file. */
  file: string;
  /** Zero-based character offset of the cursor. */
  offset: number;
  /** Absolute path that NodeIds are relative to. */
  repoRoot: string;
};

export function analyzeFocus(
  project: Project,
  req: AnalyzeRequest,
): GraphSlice {
  const target = resolveFocus(project, req.file, req.offset);
  return sliceFor(target, { repoRoot: req.repoRoot });
}

/** A `~index` picks the Nth match, but the returned focusId omits it. */
export function expandNode(
  project: Project,
  nodeId: NodeId,
  repoRoot: string,
): GraphSlice {
  if (nodeId.startsWith("external:") || nodeId.startsWith("unknown#")) {
    throw new Error(`Node is not expandable: ${nodeId}`);
  }

  const { file, name, index } = parseNodeId(nodeId);
  const sourceFile = project.getSourceFile(join(repoRoot, file));
  if (!sourceFile) throw new Error(`Node not found (missing file): ${nodeId}`);

  const declaration = callablesNamed(sourceFile, name)[index];
  if (!declaration) throw new Error(`Node not found: ${nodeId}`);

  return sliceFor(toFocusTarget(declaration, sourceFile), { repoRoot });
}

/** The slice around a focus target; shared by analyzeFocus and expandNode. */
function sliceFor(target: FocusTarget, ctx: BuildContext): GraphSlice {
  const focusNode = buildGraphNode(
    target,
    classifyDeclaration(target.declaration),
    ctx,
  );
  const callees = collectCalleeEdges(target, focusNode.id, ctx);
  const callers = collectCallerEdges(target, focusNode.id, ctx);

  return {
    focusId: focusNode.id,
    nodes: sortById(
      uniqueById([focusNode, ...callees.nodes, ...callers.nodes]),
    ),
    edges: sortById(
      [...callees.edges, ...callers.edges].filter((e) => e.from !== e.to),
    ),
    truncated: callers.truncated,
  };
}

/**
 * NodeIds carry no class or scope, so every callable with this name matches,
 * in document order; `~index` picks the Nth one. Overload signatures are
 * skipped, since analyzeFocus focuses the implementation.
 */
function callablesNamed(
  sourceFile: SourceFile,
  name: string,
): CallableDeclaration[] {
  return sourceFile
    .getDescendants()
    .filter(
      (node): node is CallableDeclaration =>
        isCallable(node) &&
        declaredName(node) === name &&
        !isOverloadSignature(node),
    );
}

/** Bodiless, with an implementation alongside; a lone `declare` is not one. */
function isOverloadSignature(callable: CallableDeclaration): boolean {
  if (isFunctionValue(callable)) return false;
  return callable.isOverload() && callable.getImplementation() !== undefined;
}

function declaredName(callable: CallableDeclaration): string | undefined {
  const named = isFunctionValue(callable) ? bindingOf(callable) : callable;
  const nameNode = named?.getNameNode();
  return nameNode && Node.isIdentifier(nameNode)
    ? nameNode.getText()
    : undefined;
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()];
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
