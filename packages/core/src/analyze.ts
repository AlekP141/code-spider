import type { Project } from "ts-morph";
import { collectCalleeEdges } from "./callees.js";
import { collectCallerEdges } from "./callers.js";
import { classifyDeclaration } from "./classify.js";
import { resolveFocus } from "./focus.js";
import { buildGraphNode, type BuildContext } from "./node-builder.js";
import type { GraphSlice } from "./types.js";

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
  const ctx: BuildContext = { repoRoot: req.repoRoot };

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
