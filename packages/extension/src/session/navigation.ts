import { join } from "node:path";
import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core";
import type { WebviewToExtension } from "@code-spider/webview/protocol";
import { toZeroBasedRange, type ZeroBasedRange } from "./ranges.js";

export type JumpTarget = { file: string; range: ZeroBasedRange };

export interface EditorPort {
  reveal(target: JumpTarget): Promise<void>;
}

export interface JumpLookup {
  nodeTarget(project: string, nodeId: NodeId): JumpTarget | undefined;
  callSiteTarget(project: string, edgeId: string): JumpTarget | undefined;
}

export type JumpMessage = Extract<
  WebviewToExtension,
  { type: "openInEditor" | "openCallSite" }
>;

/** A node opens with the cursor at its declaration; external and unknown nodes have no file. */
export function nodeJumpTarget(
  repoRoot: string,
  node: GraphNode | undefined,
): JumpTarget | undefined {
  if (!node || node.file === "") return undefined;
  const { startLine, startCharacter } = toZeroBasedRange(node.range);
  return {
    file: join(repoRoot, node.file),
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
  repoRoot: string,
  edge: GraphEdge | undefined,
  caller: GraphNode | undefined,
): JumpTarget | undefined {
  if (!edge || !caller || caller.file === "") return undefined;
  return {
    file: join(repoRoot, caller.file),
    range: toZeroBasedRange(edge.callSite),
  };
}

/** A line inside the node opens with the cursor at its start. */
function atLine(target: JumpTarget, line: number): JumpTarget {
  if (line === 0) return target;
  const startLine = target.range.startLine + line;
  return {
    file: target.file,
    range: { startLine, startCharacter: 0, endLine: startLine, endCharacter: 0 },
  };
}

export class JumpHandler {
  constructor(
    private readonly lookup: JumpLookup,
    private readonly editor: EditorPort,
  ) {}

  async handle(message: JumpMessage): Promise<void> {
    if (message.type === "openCallSite") {
      const site = this.lookup.callSiteTarget(message.project, message.edgeId);
      if (site) await this.editor.reveal(site);
      return;
    }
    const target = this.lookup.nodeTarget(message.project, message.nodeId);
    if (target) await this.editor.reveal(atLine(target, message.line ?? 0));
  }
}
