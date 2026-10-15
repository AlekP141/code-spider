import type { CallerSource, Link, LinkKind } from "../../src/path/links.js";
import { runRounds, type Rounds } from "../../src/path/rounds.js";
import type { RouteStep } from "../../src/path/routes.js";
import { searchRoutes, type SearchRequest } from "../../src/path/search.js";
import { createStopSignal, type StopSignal } from "../../src/path/signal.js";
import type { NodeId } from "../../src/types.js";

export type Call = readonly [caller: NodeId, callee: NodeId, kind?: LinkKind];

const SITE = { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 };

export type SourceOptions = {
  /** Runs inside every climb, before its links are returned; may throw. */
  onClimb?: (id: NodeId) => void;
  order?: (links: Link[]) => Link[];
};

export type GraphSource = CallerSource & {
  /** Every id passed to callersOf, in order, abandoned climbs included. */
  asked: NodeId[];
};

export function graphSource(
  calls: readonly Call[],
  options: SourceOptions = {},
): GraphSource {
  const asked: NodeId[] = [];
  return {
    asked,
    callersOf(id) {
      asked.push(id);
      options.onClimb?.(id);
      const links = calls
        .filter(([, callee]) => callee === id)
        .map(([caller, callee, kind]): Link => ({
          supplier: callee,
          consumer: caller,
          kind: kind ?? "call",
          site: SITE,
        }));
      return options.order ? options.order(links) : links;
    },
  };
}

/** "f > g" means f calls g. */
export function parseCalls(...specs: string[]): Call[] {
  return specs.map((spec) => {
    const [caller, callee] = spec.split(" > ");
    return [caller as NodeId, callee as NodeId];
  });
}

export function fakeClock(start = 0) {
  let at = start;
  return {
    now: () => at,
    advance(ms: number) {
      at += ms;
    },
  };
}

export function newFlag(): Int32Array {
  return new Int32Array(new SharedArrayBuffer(4));
}

export function neverStops(): StopSignal {
  return createStopSignal(newFlag(), 3_600_000);
}

export function turningOf(
  calls: readonly Call[],
  a = "A",
  b = "B",
): Rounds["turning"] {
  return runRounds(graphSource(calls), a, b, { signal: neverStops() }).turning;
}

export function search(
  calls: readonly Call[],
  extra: Partial<SearchRequest> = {},
  options: SourceOptions = {},
) {
  const source = graphSource(calls, options);
  const result = searchRoutes(source, {
    a: "A",
    b: "B",
    maxBoxes: 10_000,
    signal: neverStops(),
    ...extra,
  });
  return { result, asked: source.asked };
}

export function routeStep(from: NodeId, to: NodeId): RouteStep {
  return {
    from,
    to,
    link: { supplier: from, consumer: to, kind: "call", site: SITE },
  };
}

export function routeStepsOf(...specs: string[]): RouteStep[] {
  return parseCalls(...specs).map(([from, to]) => routeStep(from, to));
}

export function functionsOf(steps: readonly RouteStep[]): Set<NodeId> {
  return new Set(steps.flatMap((step) => [step.from, step.to]));
}
