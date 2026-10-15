import type { NodeId } from "../types.js";
import { byId, type Link } from "./links.js";
import type { Rounds } from "./rounds.js";

export type RouteStep = { from: NodeId; to: NodeId; link: Link };

export type RouteSelection = { functions: Set<NodeId>; steps: RouteStep[] };

type Part = { ids: Set<NodeId>; links: Link[] };

function walk(
  starts: Iterable<NodeId>,
  links: readonly Link[],
  forward: boolean,
): Set<NodeId> {
  const next = new Map<NodeId, NodeId[]>();
  for (const { supplier, consumer } of links) {
    const [from, to] = forward ? [supplier, consumer] : [consumer, supplier];
    next.set(from, [...(next.get(from) ?? []), to]);
  }
  const seen = new Set(starts);
  const queue = [...seen];
  for (let at = 0; at < queue.length; at += 1) {
    for (const id of next.get(queue[at] as NodeId) ?? []) {
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push(id);
    }
  }
  return seen;
}

/** Reachable from `start` and able to reach a goal, along the same links. */
function part(
  start: NodeId,
  goals: Set<NodeId>,
  links: readonly Link[],
): Part {
  const reach = walk([start], links, true);
  const reaching = walk(goals, links, false);
  const ids = new Set([...reach].filter((id) => reaching.has(id)));
  const inside = links.filter(
    ({ supplier, consumer }) => ids.has(supplier) && ids.has(consumer),
  );
  return { ids, links: inside };
}

const forwardSteps = (links: Link[]): RouteStep[] =>
  links.map((link) => ({ from: link.supplier, to: link.consumer, link }));

const reversedSteps = (links: Link[]): RouteStep[] =>
  links.map((link) => ({ from: link.consumer, to: link.supplier, link }));

function union(
  parts: { part: Part; steps: (links: Link[]) => RouteStep[] }[],
): RouteSelection {
  return {
    functions: new Set(parts.flatMap(({ part }) => [...part.ids])),
    steps: parts.flatMap(({ part, steps }) => steps(part.links)),
  };
}

function directRoutes(rounds: Rounds): RouteSelection {
  const { a, b, sideA, sideB } = rounds;
  const parts: Parameters<typeof union>[0] = [];
  if (sideB.found.has(a)) {
    const followed = sideB.links.filter((link) => link.supplier !== a);
    parts.push({
      part: part(b, new Set([a]), followed),
      steps: reversedSteps,
    });
  }
  if (sideA.found.has(b)) {
    const followed = sideA.links.filter((link) => link.supplier !== b);
    parts.push({
      part: part(a, new Set([b]), followed),
      steps: forwardSteps,
    });
  }
  return union(parts);
}

function generalRoutes(rounds: Rounds): RouteSelection {
  const { a, b, sideA, sideB, turning } = rounds;
  const followedA = sideA.links.filter((link) => !turning.has(link.supplier));
  const followedB = sideB.links.filter((link) => !turning.has(link.supplier));
  const reachA = walk([a], followedA, true);
  const reachB = walk([b], followedB, true);
  const live = new Set(
    [...turning].filter((id) => reachA.has(id) && reachB.has(id)),
  );
  if (live.size === 0) return { functions: new Set(), steps: [] };
  return union([
    { part: part(a, live, followedA), steps: forwardSteps },
    { part: part(b, live, followedB), steps: reversedSteps },
  ]);
}

export function selectRoutes(rounds: Rounds): RouteSelection {
  const { a, b, sideA, sideB } = rounds;
  const direct = sideB.found.has(a) || sideA.found.has(b);
  return direct ? directRoutes(rounds) : generalRoutes(rounds);
}

export function successorsOf(
  steps: readonly RouteStep[],
): Map<NodeId, NodeId[]> {
  const next = new Map<NodeId, Set<NodeId>>();
  for (const { from, to } of steps) {
    next.set(from, (next.get(from) ?? new Set()).add(to));
  }
  return new Map(
    [...next].map(([from, targets]) => [from, [...targets].sort(byId)]),
  );
}
