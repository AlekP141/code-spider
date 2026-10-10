import type { GraphSlice } from "@code-spider/core/types";
import { toFlow } from "../../src/graph/to-flow.js";
import type { Point } from "../../src/view/types.js";
import { graphFromSlice } from "../../src/view/graph-state.js";
import { PROJECT } from "./graph-states.js";

/** The React Flow nodes and edges of a slice shown as a fresh centre graph. */
export function flowOf(
  slice: GraphSlice,
  positions: Record<string, Point> = {},
) {
  return toFlow(graphFromSlice(slice, PROJECT, positions));
}
