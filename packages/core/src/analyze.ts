import { join } from "node:path";
import type { Project } from "ts-morph";
import { targetsQualifiedAs } from "./callable-names.js";
import { collectCalleeEdges } from "./callees.js";
import { collectCallerEdges } from "./callers.js";
import { classifyDeclaration } from "./classify.js";
import { resolveFocus, type FocusTarget } from "./focus.js";
import {
  buildGraphNode,
  MODULE_NAME,
  type BuildContext,
} from "./node-builder.js";
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

export function expandNode(
  project: Project,
  nodeId: NodeId,
  repoRoot: string,
): GraphSlice {
  const isPlaceholder =
    nodeId.startsWith("external:") || nodeId.startsWith("unknown:");
  if (isPlaceholder || nodeId.endsWith(`#${MODULE_NAME}`)) {
    throw new Error(`Node is not expandable: ${nodeId}`);
  }

  const { file, name, index } = parseNodeId(nodeId);
  const sourceFile = project.getSourceFile(join(repoRoot, file));
  if (!sourceFile) throw new Error(`Node not found (missing file): ${nodeId}`);

  const target = targetsQualifiedAs(sourceFile, name)[index];
  if (!target) throw new Error(`Node not found: ${nodeId}`);

  return sliceFor(target, { repoRoot });
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

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) if (!seen.has(item.id)) seen.set(item.id, item);
  return [...seen.values()];
}

function sortById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
