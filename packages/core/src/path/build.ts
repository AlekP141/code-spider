import { suppliesLabel } from "../callers/callers.js";
import { classifyDeclaration } from "../nodes/classify.js";
import {
  buildGraphNode,
  buildModuleNode,
  type BuildContext,
} from "../nodes/node-builder.js";
import { edgeId } from "../nodes/node-id.js";
import type {
  GraphEdge,
  GraphNode,
  NodeId,
  PathInfo,
  PathRoute,
  PathSummary,
} from "../types.js";
import { byId, type Link } from "./links.js";
import type { ArrangedRoutes } from "./route-graph.js";
import type { TypeScriptSource } from "./typescript-source.js";

function nodeFor(
  source: TypeScriptSource,
  id: NodeId,
  ctx: BuildContext,
): GraphNode {
  const file = source.moduleFileOf(id);
  if (file) return buildModuleNode(file, ctx);
  const target = source.targetOf(id);
  if (!target) throw new Error(`Route box is not a function: ${id}`);
  return buildGraphNode(target, classifyDeclaration(target.declaration), ctx);
}

function edgeFor(source: TypeScriptSource, link: Link): GraphEdge {
  const supplier = source.targetOf(link.supplier);
  if (!supplier) {
    throw new Error(`Route link has no supplier: ${link.supplier}`);
  }
  return {
    id: edgeId(link.supplier, link.consumer, link.kind),
    from: link.supplier,
    to: link.consumer,
    kind: link.kind,
    supplies: suppliesLabel(supplier.declaration, link.kind),
    callSite: link.site,
    resolved: true,
  };
}

export function buildRoute(
  source: TypeScriptSource,
  arranged: ArrangedRoutes,
  ctx: BuildContext,
): PathRoute {
  const nodes = arranged.boxes.map((box) => nodeFor(source, box.id, ctx));
  const edges = new Map(
    arranged.steps.map(({ link }) => {
      const edge = edgeFor(source, link);
      return [edge.id, edge] as const;
    }),
  );
  return {
    nodes: nodes.sort((x, y) => byId(x.id, y.id)),
    edges: [...edges.values()].sort((x, y) => byId(x.id, y.id)),
  };
}

export function buildPathInfo(
  arranged: ArrangedRoutes,
  route: PathRoute,
  endId: NodeId,
  summary: PathSummary,
): PathInfo {
  return {
    endId,
    boxes: arranged.boxes,
    edgeIds: route.edges.map((edge) => edge.id),
    summary,
  };
}
