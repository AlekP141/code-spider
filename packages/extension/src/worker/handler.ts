import { analyzeFocus } from "@code-spider/core";
import { ProjectCache } from "./project-cache.js";
import type { WorkerRequest, WorkerResponse } from "./protocol.js";

export type WorkerHandler = (request: WorkerRequest) => WorkerResponse;

export function createWorkerHandler(
  cache: ProjectCache = new ProjectCache(),
): WorkerHandler {
  return (request) => {
    try {
      cache.noteChanged(request.changedFiles);
      const entry = cache.open(request.file);
      if (request.kind === "warm") {
        cache.warm(entry);
        return { id: request.id, kind: "warmed" };
      }
      const slice = analyzeFocus(entry.project, {
        file: request.file,
        offset: request.offset,
        repoRoot: entry.repoRoot,
      });
      return {
        id: request.id,
        kind: "focused",
        result: { slice, repoRoot: entry.repoRoot },
      };
    } catch (error) {
      return {
        id: request.id,
        kind: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
