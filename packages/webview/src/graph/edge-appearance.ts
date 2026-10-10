import type { EdgeType } from "@code-spider/core/types";

export type EdgeAppearance = {
  className: string;
  strokeDasharray: string | undefined;
  strokeWidth: number;
};

export const DASHED = "6 4";
export const DOTTED = "1 5";

/**
 * Dashed means "could not be resolved" and always wins; passes edges are
 * dotted so the two never look alike. Colour comes from the class in CSS.
 */
export function edgeAppearance(
  kind: EdgeType,
  resolved: boolean,
): EdgeAppearance {
  const className = resolved ? `edge-${kind}` : `edge-${kind} edge-unresolved`;
  if (!resolved) {
    return { className, strokeDasharray: DASHED, strokeWidth: 1.5 };
  }
  switch (kind) {
    case "passes":
      return { className, strokeDasharray: DOTTED, strokeWidth: 1.5 };
    case "jsx":
      return { className, strokeDasharray: undefined, strokeWidth: 2.5 };
    case "call":
    case "external":
      return { className, strokeDasharray: undefined, strokeWidth: 1.5 };
  }
}
