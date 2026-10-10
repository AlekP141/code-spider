import type { EdgeType, GraphEdge, NodeId } from "@code-spider/core/types";

export type LabelKind = "returns" | "jsx" | "passes";
export type LabelLine = { kind: LabelKind; text: string };

const LINE_ORDER: readonly LabelKind[] = ["returns", "jsx", "passes"];

function labelKind(kind: EdgeType): LabelKind {
  return kind === "jsx" || kind === "passes" ? kind : "returns";
}

function compareIds(a: GraphEdge, b: GraphEdge): number {
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** One line per supplier and kind: the distinct supplies in edge-id order. */
export function supplierLabels(
  edges: readonly GraphEdge[],
): Map<NodeId, LabelLine[]> {
  const byEdgeId = [...edges].sort(compareIds);
  const grouped = new Map<NodeId, Map<LabelKind, string[]>>();
  for (const edge of byEdgeId) {
    if (edge.supplies === "") continue;
    const kind = labelKind(edge.kind);
    const kinds = grouped.get(edge.from) ?? new Map<LabelKind, string[]>();
    const texts = kinds.get(kind) ?? [];
    if (!texts.includes(edge.supplies)) texts.push(edge.supplies);
    kinds.set(kind, texts);
    grouped.set(edge.from, kinds);
  }
  const labels = new Map<NodeId, LabelLine[]>();
  for (const [supplier, kinds] of grouped) {
    const lines = LINE_ORDER.flatMap((kind) => {
      const texts = kinds.get(kind);
      return texts ? [{ kind, text: texts.join(" · ") }] : [];
    });
    labels.set(supplier, lines);
  }
  return labels;
}
