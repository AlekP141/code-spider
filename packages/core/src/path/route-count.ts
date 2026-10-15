import type { NodeId } from "../types.js";
import { successorsOf, type RouteStep } from "./routes.js";

export type CountLimits = { maxPaths: number; maxVisits: number };

export const FINAL_COUNT_LIMITS: CountLimits = {
  maxPaths: 1_000,
  maxVisits: 200_000,
};

export const PROGRESS_COUNT_LIMITS: CountLimits = {
  maxPaths: 1_000,
  maxVisits: 20_000,
};

type Frame = { id: NodeId; targets: NodeId[]; at: number };

export function countRoutes(
  steps: readonly RouteStep[],
  a: NodeId,
  b: NodeId,
  limits: CountLimits,
): { routes: number; capped: boolean } {
  const successors = successorsOf(steps);
  const onPath = new Set([a]);
  const stack: Frame[] = [{ id: a, targets: successors.get(a) ?? [], at: 0 }];
  let routes = 0;
  let visits = 0;
  for (let top = stack[0]; top; top = stack[stack.length - 1]) {
    const target = top.targets[top.at];
    if (target === undefined) {
      stack.pop();
      onPath.delete(top.id);
      continue;
    }
    if (visits === limits.maxVisits) return { routes, capped: true };
    top.at += 1;
    visits += 1;
    if (onPath.has(target)) continue;
    if (target === b) {
      routes += 1;
      if (routes === limits.maxPaths) return { routes, capped: true };
      continue;
    }
    onPath.add(target);
    stack.push({ id: target, targets: successors.get(target) ?? [], at: 0 });
  }
  return { routes, capped: false };
}
