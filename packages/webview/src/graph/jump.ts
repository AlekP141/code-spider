import type { GraphNode } from "@code-spider/core/types";
import type { WebviewToExtension } from "../protocol.js";

/** External and unknown nodes have no source file to open. */
export function nodeClickMessage(
  node: GraphNode,
  project: string,
): WebviewToExtension | undefined {
  if (node.file === "") return undefined;
  return { type: "openInEditor", project, nodeId: node.id };
}

export function edgeClickMessage(
  edgeId: string,
  project: string,
): WebviewToExtension {
  return { type: "openCallSite", project, edgeId };
}
