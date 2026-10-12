import { layoutGraph } from "../../src/graph/layout/layout.js";
import { tidyGraph } from "../../src/graph/layout/tidy-graph.js";
import { graphFromSlice, pinNodes } from "../../src/view/graph-state.js";
import type { GraphState, Point } from "../../src/view/types.js";
import { calledSlice, id, PROJECT } from "./graph-states.js";

export const CALLED = ["c0", "c1", "c2", "c3", "c4"];
export const OFFSETS = [-70, -20, 0, 20, 70, 150];

/** A centre `f` calling `names` in order, laid out with the real ELK. */
export async function laidOutCalls(
  names: string[],
  columnGap: number,
): Promise<GraphState> {
  const graph = graphFromSlice(calledSlice("f", names), PROJECT);
  const positions = await layoutGraph(graph, columnGap);
  return { ...graph, positions, columnGap };
}

/** Pins `name` at `offset` pixels below the laid-out top of `slot`. */
export function pinNear(
  graph: GraphState,
  name: string,
  slot: string,
  offset: number,
): GraphState {
  const at = graph.positions[id(slot)] ?? { x: 0, y: 0 };
  return pinNodes(graph, { [id(name)]: { x: at.x, y: at.y + offset } });
}

/** Tidy with the given graph's laid-out positions standing in for ELK. */
export async function tidyLaidOut(
  pinned: GraphState,
  laidOut: Record<string, Point>,
  columnGap: number,
): Promise<GraphState> {
  const outcome = await tidyGraph(
    () => pinned,
    () => columnGap,
    async () => laidOut,
  );
  return { ...pinned, positions: outcome?.positions ?? {} };
}
