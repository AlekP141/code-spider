import type { Project } from "ts-morph";
import { sliceForTarget } from "../analyze.js";
import type {
  GraphSlice,
  NodeId,
  PathInfo,
  PathLimits,
  PathProgress,
  PathRoute,
} from "../types.js";
import { buildPathInfo, buildRoute } from "./build.js";
import { targetFor } from "./ends.js";
import { searchRoutes } from "./search.js";
import type { StopSignal } from "./signal.js";
import { TypeScriptSource } from "./typescript-source.js";

export type PathRequest = {
  from: NodeId;
  to: NodeId;
  repoRoot: string;
  limits: PathLimits;
  signal: StopSignal;
  onProgress?: (progress: PathProgress) => void;
};

export type PathOutcome =
  | { status: "cancelled" }
  | { status: "none"; checked: number; stoppedBy?: "time" }
  | { status: "found"; centre: GraphSlice; route: PathRoute; path: PathInfo };

export function findPaths(project: Project, request: PathRequest): PathOutcome {
  const { from, to, repoRoot, limits, signal, onProgress } = request;
  if (from === to) {
    throw new Error("The start and the end are the same function");
  }
  const start = targetFor(project, from, repoRoot);
  targetFor(project, to, repoRoot);

  const source = new TypeScriptSource(
    project,
    repoRoot,
    { a: from, b: to },
    signal,
  );
  const result = searchRoutes(source, {
    a: from,
    b: to,
    maxBoxes: limits.maxBoxes,
    signal,
    onProgress,
  });
  if (result.status !== "found") return result;

  const ctx = { repoRoot };
  const route = buildRoute(source, result.arranged, ctx);
  return {
    status: "found",
    route,
    path: buildPathInfo(result.arranged, route, to, result.summary),
    centre: sliceForTarget(start, ctx),
  };
}
