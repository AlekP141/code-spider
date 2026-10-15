import type { NodeId, PathProgress, PathSummary } from "../types.js";
import type { CallerSource } from "./links.js";
import { countRoutes, PROGRESS_COUNT_LIMITS } from "./route-count.js";
import { arrangeRoutes, type ArrangedRoutes } from "./route-graph.js";
import { selectRoutes } from "./routes.js";
import { runRounds } from "./rounds.js";
import type { StopSignal } from "./signal.js";

const CLIMB_REPORT_INTERVAL_MS = 250;

export type SearchRequest = {
  a: NodeId;
  b: NodeId;
  maxBoxes: number;
  signal: StopSignal;
  onProgress?(progress: PathProgress): void;
  now?: () => number;
};

export type SearchResult =
  | { status: "cancelled" }
  | { status: "none"; checked: number; stoppedBy?: "time" }
  | { status: "found"; arranged: ArrangedRoutes; summary: PathSummary };

export function searchRoutes(
  source: CallerSource,
  request: SearchRequest,
): SearchResult {
  const { a, b, signal } = request;
  if (a === b) throw new Error("The start and the end are the same function");

  const now = request.now ?? Date.now;
  let latest: PathProgress = { checked: 0, routes: 0, routesCapped: false };
  let reportedAt = now();
  const report = (progress: PathProgress) => {
    latest = progress;
    reportedAt = now();
    request.onProgress?.(progress);
  };
  report(latest);

  const rounds = runRounds(source, a, b, {
    signal,
    onClimb(checked) {
      if (now() - reportedAt >= CLIMB_REPORT_INTERVAL_MS) {
        report({ ...latest, checked });
      }
    },
    onRoundEnd(state) {
      const { steps } = selectRoutes(state);
      const count = countRoutes(steps, a, b, PROGRESS_COUNT_LIMITS);
      report({
        checked: state.checked,
        routes: count.routes,
        routesCapped: count.capped,
      });
    },
  });

  if (rounds.stoppedBy === "cancelled") return { status: "cancelled" };
  const timed =
    rounds.stoppedBy === "time" ? ({ stoppedBy: "time" } as const) : {};

  const selection = selectRoutes(rounds);
  if (selection.functions.size === 0) {
    return { status: "none", checked: rounds.checked, ...timed };
  }
  const arranged = arrangeRoutes(selection, a, b, request.maxBoxes);
  return {
    status: "found",
    arranged,
    summary: {
      routes: arranged.routes,
      routesCapped: arranged.routesCapped,
      leftOut: arranged.leftOut,
      checked: rounds.checked,
      ...timed,
    },
  };
}
