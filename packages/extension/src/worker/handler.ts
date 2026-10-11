import {
  analyzeFocusAt,
  expandNode,
  NodeNotFoundError,
  type GraphSlice,
  type NodeId,
  type Project,
} from "@code-spider/core";
import { ProjectCache } from "./project-cache.js";
import type {
  RefreshRequest,
  RefreshResult,
  WorkerRequest,
  WorkerResponse,
} from "./protocol.js";

export type WorkerHandler = (request: WorkerRequest) => WorkerResponse;

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
  request: RefreshRequest,
  cache: ProjectCache,
): RefreshResult {
  const { project, repoRoot, tsconfig } = cache.openTsconfig(request.tsconfig);
  const centre = expandOrMissing(project, request.focusId, repoRoot);
  const expansions: RefreshResult["expansions"] = [];
  if (centre) {
    for (const nodeId of request.expanded) {
      const slice = expandOrMissing(project, nodeId, repoRoot);
      if (slice) expansions.push({ nodeId, slice });
    }
  }
  return { tsconfig, repoRoot, centre, expansions };
}

export function createWorkerHandler(
  cache: ProjectCache = new ProjectCache(),
): WorkerHandler {
  return (request) => {
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
            result: refreshSlices(request, cache),
          };
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
