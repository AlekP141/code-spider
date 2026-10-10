import type { GraphEdge, GraphNode, NodeId } from "@code-spider/core";
import {
  callSiteJumpTarget,
  nodeJumpTarget,
  type JumpLookup,
  type JumpTarget,
} from "./navigation.js";
import type { JumpRegistry } from "./ports.js";
import type { FocusResult } from "./worker/protocol.js";

type ProjectJumps = {
  repoRoot: string;
  nodes: Map<NodeId, GraphNode>;
  edges: Map<string, GraphEdge>;
};

/**
 * Every node and edge sent to the panel since it opened, per project, later
 * slices overwriting earlier ones. Node ids are relative to a project root, so
 * the project keeps two projects' ids apart.
 */
export class JumpTable implements JumpRegistry, JumpLookup {
  private readonly projects = new Map<string, ProjectJumps>();

  add(project: string, result: FocusResult): void {
    const known = this.projects.get(project) ?? {
      repoRoot: result.repoRoot,
      nodes: new Map(),
      edges: new Map(),
    };
    for (const node of result.slice.nodes) known.nodes.set(node.id, node);
    for (const edge of result.slice.edges) known.edges.set(edge.id, edge);
    this.projects.set(project, known);
  }

  has(project: string): boolean {
    return this.projects.has(project);
  }

  nodeTarget(project: string, nodeId: NodeId): JumpTarget | undefined {
    const known = this.projects.get(project);
    if (!known) return undefined;
    return nodeJumpTarget(known.repoRoot, known.nodes.get(nodeId));
  }

  callSiteTarget(project: string, edgeId: string): JumpTarget | undefined {
    const known = this.projects.get(project);
    const edge = known?.edges.get(edgeId);
    if (!known || !edge) return undefined;
    return callSiteJumpTarget(known.repoRoot, edge, known.nodes.get(edge.to));
  }

  clear(): void {
    this.projects.clear();
  }
}
