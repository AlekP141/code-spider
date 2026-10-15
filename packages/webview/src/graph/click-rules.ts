import type { GraphNode } from "@code-spider/core/types";
import type { WebviewToExtension } from "../host/protocol.js";

export type NodeClick =
  | { kind: "path"; message: WebviewToExtension | undefined }
  | { kind: "normal" };

/** Shift marks or finishes a path and never does the plain click's work. */
export function classifyNodeClick(
  shiftKey: boolean,
  node: GraphNode,
  project: string,
): NodeClick {
  if (!shiftKey) return { kind: "normal" };
  const callable = node.kind === "function" || node.kind === "component";
  const message = callable
    ? ({ type: "pathClick", project, nodeId: node.id } as const)
    : undefined;
  return { kind: "path", message };
}

export function ignoresDoubleClick(shiftKey: boolean): boolean {
  return shiftKey;
}
