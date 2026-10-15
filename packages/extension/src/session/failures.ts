import type { Notifier } from "../ports.js";
import { WorkerCrashedError } from "../worker/worker-client.js";

export class FailureReporter {
  private lastNotifiedCrash: WorkerCrashedError | undefined;

  constructor(
    private readonly notifier: Notifier,
    private readonly maxHeapMb: () => number,
  ) {}

  describe(error: unknown, search = false): string {
    if (error instanceof WorkerCrashedError) {
      if (!error.outOfMemory) {
        return `${error.message}. The next request starts a fresh worker.`;
      }
      const heap = `Code Spider ran out of memory analysing this project (limit ${this.maxHeapMb()} MB). Raise "codeSpider.worker.maxHeapMb" in settings and try again.`;
      return search
        ? `${heap} Lower "codeSpider.path.timeLimitSeconds" to stop sooner.`
        : heap;
    }
    return error instanceof Error ? error.message : String(error);
  }

  /** A crash rejects every waiting request with one error: notify once. */
  notifyCrash(error: unknown, message: string): void {
    if (!(error instanceof WorkerCrashedError)) return;
    if (error === this.lastNotifiedCrash) return;
    this.lastNotifiedCrash = error;
    this.notifier.error(message);
  }
}
