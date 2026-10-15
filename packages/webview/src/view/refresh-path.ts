import type { GraphSlice, PathRoute } from "@code-spider/core/types";
import {
  DEFAULT_TEST_VISIBILITY,
  type TestVisibility,
} from "../settings/test-visibility.js";
import { graphFromSlice } from "./graph-state.js";
import { withRoute } from "./path-graph.js";
import type { Applied } from "./refresh-order.js";
import {
  applyExpansions,
  settleRebuild,
  type Rebuilt,
  type RefreshAnswer,
} from "./refresh.js";
import type { GraphState } from "./types.js";

const NO_ROUTE: PathRoute = { nodes: [], edges: [] };

/** A pinned box that left the route stays, plain and with the data it had. */
function withPinnedFormerRoute(
  graph: GraphState,
  current: GraphState,
): GraphState {
  const nodes = { ...graph.nodes };
  for (const { id } of current.path?.boxes ?? []) {
    const node = current.nodes[id];
    if (node && current.pinned.includes(id) && !Object.hasOwn(nodes, id)) {
      nodes[id] = node;
    }
  }
  return { ...graph, nodes };
}

/**
 * A path graph's refresh: A's slice, then the route as a second entry keyed A,
 * then the expansions. The route is merged before the expansions so a route
 * box keeps its expansion, and `path` is set before the hidden set is read.
 */
export function rebuildPathGraph(
  current: GraphState,
  answer: RefreshAnswer,
  columnGap: number,
  visibility: TestVisibility = DEFAULT_TEST_VISIBILITY,
): Rebuilt {
  const path = answer.path ?? current.path;
  const route = answer.route ?? NO_ROUTE;
  const centre = graphFromSlice(answer.centre, current.project);
  const routed = path ? withRoute(centre, route, path, true) : centre;
  const routeSlice: GraphSlice = {
    focusId: answer.centre.focusId,
    nodes: route.nodes,
    edges: route.edges,
    truncated: false,
  };
  const applied: Applied[] = [
    { key: answer.centre.focusId, slice: answer.centre },
    { key: answer.centre.focusId, slice: routeSlice },
  ];
  const sliced = applyExpansions(current, answer, { graph: routed, applied });
  const graph = withPinnedFormerRoute(sliced.graph, current);
  return settleRebuild(
    current,
    answer,
    { graph, applied: sliced.applied },
    columnGap,
    visibility,
  );
}
