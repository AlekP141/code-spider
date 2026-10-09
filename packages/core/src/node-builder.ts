import { relative } from "node:path";
import type { Node } from "ts-morph";
import { nodeNameOf } from "./callable-names.js";
import type { FocusTarget } from "./focus.js";
import { inputTypeLabel, returnTypeLabel } from "./labels.js";
import { makeNodeId, toPosixPath } from "./node-id.js";
import type { GraphNode, NodeKind, Range } from "./types.js";

export const CODE_PREVIEW_MAX_LINES = 25;

export type BuildContext = {
  /** Absolute path that NodeIds and `file` fields are relative to. */
  repoRoot: string;
};

export function rangeOf(node: Node): Range {
  const sourceFile = node.getSourceFile();
  const start = sourceFile.getLineAndColumnAtPos(node.getStart());
  const end = sourceFile.getLineAndColumnAtPos(node.getEnd());
  return {
    startLine: start.line,
    startColumn: start.column,
    endLine: end.line,
    endColumn: end.column,
  };
}

export function buildGraphNode(
  target: FocusTarget,
  kind: NodeKind,
  ctx: BuildContext,
): GraphNode {
  const absolute = target.sourceFile.getFilePath();
  const file = toPosixPath(relative(ctx.repoRoot, absolute));

  const { name, index } = nodeNameOf(target);
  const text = target.textNode.getText();
  const lines = text.split(/\r?\n/);
  const { text: returnType, isAsync } = returnTypeLabel(target.declaration);

  return {
    id: makeNodeId(file, name, index),
    kind,
    name: target.name,
    file,
    range: rangeOf(target.textNode),
    inputType: inputTypeLabel(target.declaration),
    returnType,
    isAsync,
    lineCount: lines.length,
    codePreview: lines.slice(0, CODE_PREVIEW_MAX_LINES).join("\n"),
  };
}
