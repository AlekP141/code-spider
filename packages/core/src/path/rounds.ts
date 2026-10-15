import type { NodeId } from "../types.js";
import { byId, isClimbable, type CallerSource, type Link } from "./links.js";
import { SearchStopped, type StopReason, type StopSignal } from "./signal.js";

export type SearchSide = {
  found: Set<NodeId>;
  links: Link[];
  finders: Map<NodeId, Set<NodeId>>;
};

export type Rounds = {
  a: NodeId;
  b: NodeId;
  sideA: SearchSide;
  sideB: SearchSide;
  turning: Set<NodeId>;
  checked: number;
  stoppedBy: StopReason | undefined;
};

export type RoundsHooks = {
  signal: StopSignal;
  onClimb?(checked: number): void;
  onRoundEnd?(rounds: Rounds): void;
};

function newSide(start: NodeId): SearchSide {
  return { found: new Set([start]), links: [], finders: new Map() };
}

function intersection(x: Set<NodeId>, y: Set<NodeId>): Set<NodeId> {
  return new Set([...x].filter((id) => y.has(id)));
}

function climbableIn(
  frontier: NodeId[],
  side: SearchSide,
  turning: Set<NodeId>,
): NodeId[] {
  const foundByOpen = (id: NodeId) =>
    [...(side.finders.get(id) ?? [])].some((finder) => !turning.has(finder));
  return frontier
    .filter((id) => isClimbable(id) && !turning.has(id) && foundByOpen(id))
    .sort(byId);
}

function record(side: SearchSide, climbed: NodeId, links: Link[]): NodeId[] {
  const discovered: NodeId[] = [];
  for (const link of links) {
    side.links.push(link);
    const finders = side.finders.get(link.consumer) ?? new Set<NodeId>();
    finders.add(climbed);
    side.finders.set(link.consumer, finders);
    if (!side.found.has(link.consumer)) {
      side.found.add(link.consumer);
      discovered.push(link.consumer);
    }
  }
  return discovered;
}

export function runRounds(
  source: CallerSource,
  a: NodeId,
  b: NodeId,
  hooks: RoundsHooks,
): Rounds {
  const rounds: Rounds = {
    a,
    b,
    sideA: newSide(a),
    sideB: newSide(b),
    turning: new Set(),
    checked: 0,
    stoppedBy: undefined,
  };

  const climb = (side: SearchSide, id: NodeId): NodeId[] | undefined => {
    if (hooks.signal.isRequested()) {
      rounds.stoppedBy = hooks.signal.reason() ?? "cancelled";
      return undefined;
    }
    let links: Link[];
    try {
      links = source.callersOf(id);
    } catch (error) {
      if (!(error instanceof SearchStopped)) throw error;
      rounds.stoppedBy = hooks.signal.reason() ?? "cancelled";
      return undefined;
    }
    const discovered = record(side, id, links);
    rounds.checked += 1;
    hooks.onClimb?.(rounds.checked);
    return discovered;
  };

  let frontierA = [a];
  let frontierB = [b];
  for (let round = 1; ; round += 1) {
    const { sideA, sideB, turning } = rounds;
    const climbA =
      round === 1 ? frontierA : climbableIn(frontierA, sideA, turning);
    const climbB =
      round === 1 ? frontierB : climbableIn(frontierB, sideB, turning);
    if (climbA.length + climbB.length === 0) break;

    const nextA: NodeId[] = [];
    const nextB: NodeId[] = [];
    for (const [side, ids, next] of [
      [sideA, climbA, nextA],
      [sideB, climbB, nextB],
    ] as const) {
      for (const id of ids) {
        const discovered = climb(side, id);
        if (!discovered) break;
        next.push(...discovered);
      }
      if (rounds.stoppedBy) break;
    }
    if (rounds.stoppedBy) break;

    rounds.turning = intersection(rounds.sideA.found, rounds.sideB.found);
    hooks.onRoundEnd?.(rounds);
    frontierA = nextA;
    frontierB = nextB;
  }

  rounds.turning = intersection(rounds.sideA.found, rounds.sideB.found);
  return rounds;
}
