import { join } from "node:path";
import type { NodeId } from "@code-spider/core";
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import { toZeroBasedRange, type ZeroBasedRange } from "./ranges.js";
import type { CurrentGraph } from "./session.js";

export type JumpTarget = { file: string; range: ZeroBasedRange };

export interface EditorPort {
  reveal(target: JumpTarget): Promise<void>;
}

/** A node opens with the cursor at its declaration; external and unknown nodes have no file. */
export function nodeJumpTarget(
  graph: CurrentGraph,
  nodeId: NodeId,
): JumpTarget | undefined {
  const node = graph.slice.nodes.find((candidate) => candidate.id === nodeId);
  if (!node || node.file === "") return undefined;
  const { startLine, startCharacter } = toZeroBasedRange(node.range);
  return {
    file: join(graph.repoRoot, node.file),
    range: {
      startLine,
      startCharacter,
      endLine: startLine,
      endCharacter: startCharacter,
    },
  };
}

/** An edge opens at its call site, which lies in the consumer (`to`) node's file. */
export function callSiteJumpTarget(
  graph: CurrentGraph,
  edgeId: string,
): JumpTarget | undefined {
  const edge = graph.slice.edges.find((candidate) => candidate.id === edgeId);
  const caller = edge
    ? graph.slice.nodes.find((candidate) => candidate.id === edge.to)
    : undefined;
  if (!edge || !caller || caller.file === "") return undefined;
  return {
    file: join(graph.repoRoot, caller.file),
    range: toZeroBasedRange(edge.callSite),
  };
}

export class JumpHandler {
  constructor(
    private readonly graph: () => CurrentGraph | undefined,
    private readonly editor: EditorPort,
  ) {}

  /** `ready` belongs to the panel; `focus`, `expand` and `refresh` arrive in M3. */
  async handle(message: WebviewToExtension): Promise<void> {
    const graph = this.graph();
    if (!graph) return;
    const target =
      message.type === "openInEditor"
        ? nodeJumpTarget(graph, message.nodeId)
        : message.type === "openCallSite"
          ? callSiteJumpTarget(graph, message.edgeId)
          : undefined;
    if (target) await this.editor.reveal(target);
  }
}
