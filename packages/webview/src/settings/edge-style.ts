export const EDGE_STYLES = ["stepped", "curved"] as const;
export type EdgeStyle = (typeof EDGE_STYLES)[number];
export const DEFAULT_EDGE_STYLE: EdgeStyle = "stepped";

export function isEdgeStyle(raw: unknown): raw is EdgeStyle {
  return EDGE_STYLES.some((style) => style === raw);
}

export function normaliseEdgeStyle(raw: unknown): EdgeStyle {
  return isEdgeStyle(raw) ? raw : DEFAULT_EDGE_STYLE;
}
