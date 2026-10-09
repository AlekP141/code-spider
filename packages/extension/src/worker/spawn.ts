import { Worker } from "node:worker_threads";
import type { WorkerLike } from "./worker-client.js";

/**
 * Large projects exceed Node's default heap (the lobe-chat measurement in the
 * perf note needed 6 GiB), so the limit is raised per worker.
 */
export function spawnAnalysisWorker(
  workerPath: string,
  maxHeapMb: number,
): WorkerLike {
  return new Worker(workerPath, {
    resourceLimits: { maxOldGenerationSizeMb: maxHeapMb },
  });
}
