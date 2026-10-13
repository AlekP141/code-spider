import type { GraphNode } from "@code-spider/core/types";
import type { WebviewToExtension } from "../host/protocol.js";
import type { GraphState } from "../view/types.js";
import { CODE_PADDING_Y, LINE_HEIGHT } from "./constants.js";

/** External and unknown nodes have no source file to open. */
export function nodeClickMessage(
  node: GraphNode,
  project: string,
  line?: number,
): WebviewToExtension | undefined {
  if (node.file === "") return undefined;
  const message = { type: "openInEditor", project, nodeId: node.id } as const;
  return line === undefined ? message : { ...message, line };
}

/** The preview line `offsetY` flow pixels below the top of the code region. */
export function codeLineAt(offsetY: number, codePreview: string): number {
  const last = codePreview.split("\n").length - 1;
  const line = Math.floor((offsetY - CODE_PADDING_Y) / LINE_HEIGHT);
  return Math.min(last, Math.max(0, line));
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
