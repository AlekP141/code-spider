import type { GraphSlice } from "@code-spider/core";
import { useEffect, useState } from "react";
import { applyPositions, layoutPositions } from "./layout.js";
import { toFlow, type SpiderFlowEdge, type SpiderFlowNode } from "./to-flow.js";

export type Laid = {
  /** Changes with every layout so the canvas remounts and refits the view. */
  key: number;
  nodes: SpiderFlowNode[];
  edges: SpiderFlowEdge[];
};

type LayoutState = { laid: Laid | undefined; error: string | undefined };

export function useLayout(slice: GraphSlice): LayoutState {
  const [state, setState] = useState<LayoutState>({
    laid: undefined,
    error: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        const { nodes, edges } = toFlow(slice);
        return layoutPositions(nodes, edges).then((positions) => ({
          nodes: applyPositions(nodes, positions),
          edges,
        }));
      })
      .then(
        ({ nodes, edges }) => {
          if (cancelled) return;
          setState((previous) => ({
            laid: { key: (previous.laid?.key ?? 0) + 1, nodes, edges },
            error: undefined,
          }));
        },
        (error: unknown) => {
          if (cancelled) return;
          setState({
            laid: undefined,
            error: error instanceof Error ? error.message : String(error),
          });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [slice]);

  return state;
}
