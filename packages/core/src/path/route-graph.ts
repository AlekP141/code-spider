import type { NodeId, PathBox } from "../types.js";
import { byId } from "./links.js";
import { countRoutes, FINAL_COUNT_LIMITS } from "./route-count.js";
import {
  successorsOf,
  type RouteSelection,
  type RouteStep,
} from "./routes.js";

export type ArrangedRoutes = {
  boxes: PathBox[];
  steps: RouteStep[];
  leftOut: number;
  routes: number;
  routesCapped: boolean;
};

function distances(
  start: NodeId,
  next: Map<NodeId, NodeId[]>,
): Map<NodeId, number> {
  const distance = new Map([[start, 0]]);
  const queue = [start];
  for (let at = 0; at < queue.length; at += 1) {
    const id = queue[at] as NodeId;
    for (const target of next.get(id) ?? []) {
      if (distance.has(target)) continue;
      distance.set(target, (distance.get(id) as number) + 1);
      queue.push(target);
    }
  }
  return distance;
}

function rank(
  selection: RouteSelection,
  a: NodeId,
  b: NodeId,
): { id: NodeId; length: number }[] {
  const flipped = selection.steps.map((step) => ({
    ...step,
    from: step.to,
    to: step.from,
  }));
  const fromA = distances(a, successorsOf(selection.steps));
  const toB = distances(b, successorsOf(flipped));
  return [...selection.functions]
    .map((id) => ({
      id,
      length: (fromA.get(id) ?? Infinity) + (toB.get(id) ?? Infinity),
    }))
    .sort((x, y) => x.length - y.length || byId(x.id, y.id));
}

function keepWholeGroups(
  ranked: { id: NodeId; length: number }[],
  maxBoxes: number,
): NodeId[] {
  let kept = 0;
  while (kept < ranked.length) {
    let end = kept;
    while (ranked[end]?.length === ranked[kept]?.length) end += 1;
    if (kept > 0 && end > maxBoxes) break;
    kept = end;
  }
  return ranked.slice(0, kept).map(({ id }) => id);
}

/** Longest path from A, skipping the links that close a cycle. */
function columnsOf(a: NodeId, steps: readonly RouteStep[]) {
  const successors = successorsOf(steps);
  const acyclic = new Map<NodeId, NodeId[]>();
  const visited = new Set([a]);
  const onStack = new Set([a]);
  const finished: NodeId[] = [];
  const stack = [{ id: a, at: 0 }];
  for (let top = stack[0]; top; top = stack[stack.length - 1]) {
    const target = (successors.get(top.id) ?? [])[top.at];
    if (target === undefined) {
      stack.pop();
      onStack.delete(top.id);
      finished.push(top.id);
      continue;
    }
    top.at += 1;
    if (onStack.has(target)) continue;
    acyclic.set(top.id, [...(acyclic.get(top.id) ?? []), target]);
    if (visited.has(target)) continue;
    visited.add(target);
    onStack.add(target);
    stack.push({ id: target, at: 0 });
  }

  const column = new Map([[a, 0]]);
  for (const id of finished.reverse()) {
    const next = (column.get(id) ?? 0) + 1;
    for (const target of acyclic.get(id) ?? []) {
      column.set(target, Math.max(column.get(target) ?? 0, next));
    }
  }
  return column;
}

export function arrangeRoutes(
  selection: RouteSelection,
  a: NodeId,
  b: NodeId,
  maxBoxes: number,
): ArrangedRoutes {
  const keptIds = keepWholeGroups(rank(selection, a, b), maxBoxes);
  const kept = new Set(keptIds);
  const steps = selection.steps.filter(
    ({ from, to }) => kept.has(from) && kept.has(to),
  );
  const columns = columnsOf(a, steps);
  const { routes, capped } = countRoutes(steps, a, b, FINAL_COUNT_LIMITS);
  return {
    boxes: keptIds.map((id) => ({ id, column: columns.get(id) ?? 0 })),
    steps,
    leftOut: selection.functions.size - kept.size,
    routes,
    routesCapped: capped,
  };
}
