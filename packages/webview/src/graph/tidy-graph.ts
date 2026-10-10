import type { NodeId } from "@code-spider/core/types";
import { rowGap } from "../column-gap.js";
import type { GraphState, Point } from "../view/types.js";
import { NODE_WIDTH } from "./constants.js";
import { layoutPositions } from "./layout.js";
import { nodeHeight } from "./node-size.js";
import type { Size } from "./placement.js";
import { tidyPositions } from "./tidy.js";
import { toFlow } from "./to-flow.js";

export type TidyOutcome = {
  generation: number;
  columnGap: number;
  positions: Record<NodeId, Point>;
};

function sizesOf(graph: GraphState): Record<NodeId, Size> {
  return Object.fromEntries(
    Object.values(graph.nodes).map((node) => [
      node.id,
      { width: NODE_WIDTH, height: nodeHeight(node) },
    ]),
  );
}

function pinnedAt(graph: GraphState): Record<NodeId, Point> {
  return Object.fromEntries(
    graph.pinned.flatMap((id) => {
      const at = graph.positions[id];
      return at ? [[id, at]] : [];
    }),
  );
}

/**
 * Lays out the whole current graph and tidies the result around its pinned
 * nodes. If the graph's contents changed while ELK ran the result is stale, so
 * it runs again; if the graph was replaced there is nothing left to tidy.
 */
export async function tidyGraph(
  getGraph: () => GraphState | undefined,
  getColumnGap: () => number,
  layout: typeof layoutPositions = layoutPositions,
): Promise<TidyOutcome | undefined> {
  for (;;) {
    const graph = getGraph();
    if (!graph) return undefined;
    const { nodes, edges } = toFlow(graph);
    const columnGap = getColumnGap();
    const elk = await layout(nodes, edges, columnGap);
    const latest = getGraph();
    if (latest?.generation !== graph.generation) return undefined;
    if (latest.revision !== graph.revision) continue;
    return {
      generation: graph.generation,
      columnGap,
      positions: tidyPositions({
        elk,
        sizes: sizesOf(graph),
        pinned: pinnedAt(graph),
        margin: rowGap(columnGap),
      }),
    };
  }
}
