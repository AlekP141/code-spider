import { analyzeFocusAt, expandNode } from "@code-spider/core";
import { ProjectCache } from "./project-cache.js";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

export type WorkerHandler = (request: WorkerRequest) => WorkerResponse;

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
