import { join } from "node:path";
import type { Project } from "ts-morph";
import type { AnalyzeAtRequest } from "../analyze.js";
import { NodeNotFoundError } from "../errors.js";
import { targetsQualifiedAs } from "../focus/callable-names.js";
import { findFocus, type FocusTarget } from "../focus/focus.js";
import { positionToOffset } from "../focus/position.js";
import { classifyDeclaration } from "../nodes/classify.js";
import { MODULE_NAME, nodeIdOf } from "../nodes/node-builder.js";
import { parseNodeId } from "../nodes/node-id.js";
import { isTestPath } from "../nodes/test-path.js";
import type { NodeId } from "../types.js";

export type ResolvedFunction = {
  id: NodeId;
  name: string;
  kind: "function" | "component";
  isTest: boolean;
};

/** The function at a position, or undefined when there is none. */
export function identifyAt(
  project: Project,
  req: AnalyzeAtRequest,
): ResolvedFunction | undefined {
  const sourceFile = project.getSourceFile(req.file);
  if (!sourceFile) throw new Error(`File is not in project: ${req.file}`);

  const offset = positionToOffset(
    sourceFile.getFullText(),
    req.line,
    req.character,
  );
  const target = findFocus(project, req.file, offset);
  if (!target) return undefined;

  const id = nodeIdOf(target, { repoRoot: req.repoRoot });
  return {
    id,
    name: target.name,
    kind:
      classifyDeclaration(target.declaration) === "component"
        ? "component"
        : "function",
    isTest: isTestPath(parseNodeId(id).file),
  };
}

/** The function behind a node id; other kinds of id have none. */
export function targetFor(
  project: Project,
  nodeId: NodeId,
  repoRoot: string,
): FocusTarget {
  const isPlaceholder =
    nodeId.startsWith("external:") || nodeId.startsWith("unknown:");
  if (isPlaceholder || nodeId.endsWith(`#${MODULE_NAME}`)) {
    throw new Error(`Not a function: ${nodeId}`);
  }

  const { file, name, index } = parseNodeId(nodeId);
  const sourceFile = project.getSourceFile(join(repoRoot, file));
  if (!sourceFile) {
    throw new NodeNotFoundError(
      `Node not found (missing file): ${nodeId}`,
      nodeId,
    );
  }

  const target = targetsQualifiedAs(sourceFile, name)[index];
  if (!target) throw new NodeNotFoundError(`Node not found: ${nodeId}`, nodeId);
  return target;
}
