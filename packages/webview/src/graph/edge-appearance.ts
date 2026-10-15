import type { EdgeType } from "@code-spider/core/types";

export type EdgeAppearance = {
  className: string;
  strokeDasharray: string | undefined;
  strokeWidth: number;
};

export const DASHED = "6 4";
export const DOTTED = "1 5";
export const TEST_DASH = "3 3";
export const INFERRED_DASH = "10 3 2 3";

/**
 * Dashed means "could not be resolved" and always wins; passes edges are
 * dotted and injected edges, which are inferred from what callers pass in,
 * dash-dotted so the three never look alike. An edge that touches test code gets the
 * `edge-test` class and, if it would be solid, a short dash. Colour comes from
 * the class in CSS.
 */
export function edgeAppearance(
  kind: EdgeType,
  resolved: boolean,
  touchesTest = false,
): EdgeAppearance {
  const base = resolved ? `edge-${kind}` : `edge-${kind} edge-unresolved`;
  const className = touchesTest ? `${base} edge-test` : base;
  if (!resolved) {
    return { className, strokeDasharray: DASHED, strokeWidth: 1.5 };
  }
  const solid = touchesTest ? TEST_DASH : undefined;
  switch (kind) {
    case "passes":
      return { className, strokeDasharray: DOTTED, strokeWidth: 1.5 };
    case "injected":
      return { className, strokeDasharray: INFERRED_DASH, strokeWidth: 1.5 };
    case "jsx":
      return { className, strokeDasharray: solid, strokeWidth: 2.5 };
    case "call":
    case "external":
      return { className, strokeDasharray: solid, strokeWidth: 1.5 };
  }
}
