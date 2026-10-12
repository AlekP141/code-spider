import type { GraphNode } from "@code-spider/core/types";
import type { WebviewToExtension } from "../host/protocol.js";
import type { GraphState } from "../view/types.js";

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

export function expandMessage(
  nodeId: string,
  project: string,
  generation: number,
): WebviewToExtension {
  return { type: "expand", project, nodeId, generation };
}

export function refreshMessage(graph: GraphState): WebviewToExtension {
  return {
    type: "refresh",
    project: graph.project,
    generation: graph.generation,
    focusId: graph.focusId,
    expanded: Object.keys(graph.slices).filter((key) => key !== graph.focusId),
  };
}
