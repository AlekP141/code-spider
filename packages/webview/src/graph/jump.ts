import type { GraphNode } from "@code-spider/core/types";
import type { WebviewToExtension } from "../protocol.js";

/** External and unknown nodes have no source file to open. */
export function nodeClickMessage(
  node: GraphNode,
): WebviewToExtension | undefined {
  if (node.file === "") return undefined;
  return { type: "openInEditor", nodeId: node.id };
}

export function edgeClickMessage(edgeId: string): WebviewToExtension {
  return { type: "openCallSite", edgeId };
}
