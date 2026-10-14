import type { GraphNode, GraphSlice, NodeId } from "@code-spider/core";
import type { ChangeKind } from "@code-spider/webview/protocol";
import { posix } from "node:path";
import type { ChangeMap, FileChange } from "./parse-diff.js";

function changeOf(
  node: GraphNode,
  change: FileChange | undefined,
): GraphNode["change"] {
  if (!change) return undefined;
  if (change.kind === "added") return "added";
  const { startLine, endLine } = node.range;
  const touched = change.lines.some(
    (span) => span.start <= endLine && span.end >= startLine,
  );
  return touched ? "modified" : undefined;
}

function nodeChange(
  node: GraphNode,
  changes: ChangeMap,
): GraphNode["change"] {
  if (node.file === "") return undefined;
  return changeOf(node, changes.get(posix.normalize(node.file)));
}

/**
 * Marks the nodes whose lines the diff touches. Node files are relative to
 * the repo root, the same base the diff paths use.
 */
export function annotateSlice(
  slice: GraphSlice,
  changes: ChangeMap,
): GraphSlice {
  if (changes.size === 0) return slice;
  const nodes = slice.nodes.map((node) => {
    const change = nodeChange(node, changes);
    return change ? { ...node, change } : node;
  });
  return { ...slice, nodes };
}

/** The marks of the nodes the diff touches, whatever `change` they carry. */
export function changeMarks(
  nodes: readonly GraphNode[],
  changes: ChangeMap,
): Record<NodeId, ChangeKind> {
  const marks: Record<NodeId, ChangeKind> = {};
  if (changes.size === 0) return marks;
  for (const node of nodes) {
    const change = nodeChange(node, changes);
    if (change) marks[node.id] = change;
  }
  return marks;
}
