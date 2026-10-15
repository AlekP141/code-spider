import {
  createStopSignal,
  findPaths,
  identifyAt,
  NodeNotFoundError,
  type GraphSlice,
} from "@code-spider/core";
import type { ProjectCache, ProjectEntry } from "./project-cache.js";
import type {
  RefreshPath,
  RefreshRequest,
  RefreshResult,
  WorkerPathOutcome,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

export type Emit = (response: WorkerResponse) => void;

type Request<K extends WorkerRequest["kind"]> = Extract<
  WorkerRequest,
  { kind: K }
>;

export type PathPart = Pick<
  RefreshResult,
  "route" | "path" | "pathStatus" | "pathStoppedBy"
> & { centre: GraphSlice | undefined };

export function resolveEnd(
  request: Request<"resolveEnd">,
  cache: ProjectCache,
): WorkerResponse {
  const entry = cache.open(request.file);
  const found = identifyAt(entry.project, {
    file: request.file,
    line: request.line,
    character: request.character,
    repoRoot: entry.repoRoot,
  });
  return {
    id: request.id,
    kind: "resolved",
    result: found && {
      tsconfig: entry.tsconfig,
      repoRoot: entry.repoRoot,
      nodeId: found.id,
      name: found.name,
      isTest: found.isTest,
    },
  };
}

type Search = Pick<
  Request<"findPath">,
  "id" | "fromId" | "toId" | "limits" | "cancel"
>;

function searchPath(
  entry: ProjectEntry,
  cache: ProjectCache,
  request: Search,
  emit: Emit | undefined,
  now: (() => number) | undefined,
): WorkerPathOutcome {
  cache.warm(entry);
  const signal = createStopSignal(
    new Int32Array(request.cancel),
    request.limits.timeLimitMs,
    now,
  );
  try {
    return findPaths(entry.project, {
      from: request.fromId,
      to: request.toId,
      repoRoot: entry.repoRoot,
      limits: request.limits,
      signal,
      onProgress: (progress) =>
        emit?.({ id: request.id, kind: "pathProgress", progress }),
    });
  } catch (error) {
    if (error instanceof NodeNotFoundError && error.nodeId !== undefined) {
      return { status: "gone", nodeId: error.nodeId };
    }
    throw error;
  }
}

export function findPath(
  request: Request<"findPath">,
  cache: ProjectCache,
  emit: Emit | undefined,
  now: (() => number) | undefined,
): WorkerResponse {
  const entry = cache.openTsconfig(request.tsconfig);
  const outcome = searchPath(entry, cache, request, emit, now);
  return {
    id: request.id,
    kind: "pathDone",
    result: { tsconfig: entry.tsconfig, repoRoot: entry.repoRoot, outcome },
  };
}

export function refreshPathPart(
  entry: ProjectEntry,
  cache: ProjectCache,
  request: RefreshRequest & { id: number },
  path: RefreshPath,
  emit: Emit | undefined,
  now: (() => number) | undefined,
): PathPart {
  const outcome = searchPath(
    entry,
    cache,
    {
      id: request.id,
      fromId: request.focusId,
      toId: path.endId,
      limits: path.limits,
      cancel: path.cancel,
    },
    emit,
    now,
  );
  switch (outcome.status) {
    case "found":
      return {
        centre: outcome.centre,
        route: outcome.route,
        path: outcome.path,
      };
    case "none":
      return {
        centre: undefined,
        pathStatus: "none",
        ...(outcome.stoppedBy ? { pathStoppedBy: outcome.stoppedBy } : {}),
      };
    default:
      return { centre: undefined, pathStatus: outcome.status };
  }
}
