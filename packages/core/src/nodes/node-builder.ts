import { relative } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { nodeNameOf } from "../focus/callable-names.js";
import type { FocusTarget } from "../focus/focus.js";
import { inputTypeLabel, returnTypeLabel } from "./labels.js";
import { makeNodeId, toPosixPath } from "./node-id.js";
import { isTestPath } from "./test-path.js";
import type { GraphNode, NodeKind, Range } from "../types.js";

export const CODE_PREVIEW_MAX_LINES = 25;

/** The name part of a module box's id, as in `src/main.tsx#<module>`. */
export const MODULE_NAME = "<module>";

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

/**
 * The box for a file's top-level code, the caller of anything used outside
 * every named function: `root.render(<App />)`, route tables, `memo(Inner)`.
 */
export function buildModuleNode(
  sourceFile: SourceFile,
  ctx: BuildContext,
): GraphNode {
  const file = repoRelative(sourceFile, ctx);
  return {
    id: makeNodeId(file, MODULE_NAME),
    kind: "module",
    name: sourceFile.getBaseName(),
    file,
    range: rangeOf(sourceFile),
    inputType: "",
    returnType: "",
    isAsync: false,
    lineCount: sourceFile.getEndLineNumber(),
    codePreview: "",
    ...testFlag(file, "module"),
  };
}

export function buildGraphNode(
  target: FocusTarget,
  kind: NodeKind,
  ctx: BuildContext,
): GraphNode {
  const file = repoRelative(target.sourceFile, ctx);

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
    ...testFlag(file, kind),
  };
}

function testFlag(file: string, kind: NodeKind): { isTest?: true } {
  const placeholder = kind === "external" || kind === "unknown";
  return !placeholder && isTestPath(file) ? { isTest: true } : {};
}

function repoRelative(sourceFile: SourceFile, ctx: BuildContext): string {
  return toPosixPath(relative(ctx.repoRoot, sourceFile.getFilePath()));
}
