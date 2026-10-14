import type { GraphNode, GraphSlice } from "@code-spider/core";
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
    if (node.file === "") return node;
    const change = changeOf(node, changes.get(posix.normalize(node.file)));
    return change ? { ...node, change } : node;
  });
  return { ...slice, nodes };
}
