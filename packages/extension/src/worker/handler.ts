import {
  analyzeFocusAt,
  expandNode,
  NodeNotFoundError,
  type GraphSlice,
  type NodeId,
  type Project,
} from "@code-spider/core";
import {
  findPath,
  refreshPathPart,
  resolveEnd,
  type Emit,
  type PathPart,
} from "./path-handler.js";
import { ProjectCache } from "./project-cache.js";
import type {
  RefreshRequest,
  RefreshResult,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

export type WorkerHandler = (
  request: WorkerRequest,
  emit?: Emit,
) => WorkerResponse;

function expandOrMissing(
  project: Project,
  nodeId: NodeId,
  repoRoot: string,
): GraphSlice | undefined {
  try {
    return expandNode(project, nodeId, repoRoot);
  } catch (error) {
    if (error instanceof NodeNotFoundError) return undefined;
    throw error;
  }
}

function refreshSlices(
  request: RefreshRequest & { id: number },
  cache: ProjectCache,
  emit: Emit | undefined,
  now: (() => number) | undefined,
): RefreshResult {
  const entry = cache.openTsconfig(request.tsconfig);
  const { project, repoRoot, tsconfig } = entry;
  const part: PathPart = request.path
    ? refreshPathPart(entry, cache, request, request.path, emit, now)
    : { centre: expandOrMissing(project, request.focusId, repoRoot) };
  const expansions: RefreshResult["expansions"] = [];
  if (part.centre) {
    for (const nodeId of request.expanded) {
      const slice = expandOrMissing(project, nodeId, repoRoot);
      if (slice) expansions.push({ nodeId, slice });
    }
  }
  return { tsconfig, repoRoot, expansions, ...part };
}

export function createWorkerHandler(
  cache: ProjectCache = new ProjectCache(),
  now?: () => number,
): WorkerHandler {
  return (request, emit) => {
    try {
      cache.noteChanged(request.changedFiles);
      switch (request.kind) {
        case "warm":
          cache.warm(cache.open(request.file));
          return { id: request.id, kind: "warmed" };
        case "focus": {
          const entry = cache.open(request.file);
          const slice = analyzeFocusAt(entry.project, {
            file: request.file,
            line: request.line,
            character: request.character,
            repoRoot: entry.repoRoot,
          });
          return {
            id: request.id,
            kind: "focused",
            result: {
              slice,
              repoRoot: entry.repoRoot,
              tsconfig: entry.tsconfig,
            },
          };
        }
        case "sliceForNode": {
          const entry = cache.openTsconfig(request.tsconfig);
          const slice = expandNode(
            entry.project,
            request.nodeId,
            entry.repoRoot,
          );
          return {
            id: request.id,
            kind: "sliced",
            result: {
              slice,
              repoRoot: entry.repoRoot,
              tsconfig: entry.tsconfig,
            },
          };
        }
        case "refresh":
          return {
            id: request.id,
            kind: "refreshed",
            result: refreshSlices(request, cache, emit, now),
          };
        case "resolveEnd":
          return resolveEnd(request, cache);
        case "findPath":
          return findPath(request, cache, emit, now);
      }
    } catch (error) {
      return {
        id: request.id,
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
