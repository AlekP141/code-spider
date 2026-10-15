import type { NodeId, PathLimits, PathProgress } from "@code-spider/core";
import { startPathRun, type FindPathArgs, type PathRun } from "./path-run.js";
import type {
  ExpandResult,
  FindPathResult,
  FocusResult,
  RefreshResult,
  ResolvedEnd,
  WorkerRequest,
  WorkerRequestBody,
  WorkerResponse,
} from "./protocol.js";

/** The part of `worker_threads.Worker` the client depends on. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  on(event: "message", listener: (message: WorkerResponse) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (exitCode: number) => void): unknown;
  terminate(): Promise<number>;
}

export class WorkerCrashedError extends Error {
  constructor(
    message: string,
    readonly outOfMemory: boolean,
  ) {
    super(message);
    this.name = "WorkerCrashedError";
  }
}

type Waiting = {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: PathProgress) => void;
};

export class WorkerClient {
  private worker: WorkerLike | undefined;
  private nextId = 1;
  private disposed = false;
  private readonly waiting = new Map<number, Waiting>();

  constructor(private readonly spawn: () => WorkerLike) {}

  async warm(file: string, changedFiles: string[]): Promise<void> {
    await this.request({ kind: "warm", file, changedFiles });
  }

  async focus(
    file: string,
    line: number,
    character: number,
    changedFiles: string[],
  ): Promise<FocusResult> {
    const response = await this.request({
      kind: "focus",
      file,
      line,
      character,
      changedFiles,
    });
    if (response.kind !== "focused") {
      throw new Error(`Unexpected worker response: ${response.kind}`);
    }
    return response.result;
  }

  async sliceForNode(
    tsconfig: string,
    nodeId: NodeId,
    changedFiles: string[],
  ): Promise<ExpandResult> {
    const response = await this.request({
      kind: "sliceForNode",
      tsconfig,
      nodeId,
      changedFiles,
    });
    if (response.kind !== "sliced") {
      throw new Error(`Unexpected worker response: ${response.kind}`);
    }
    return response.result;
  }

  async refresh(
    tsconfig: string,
    focusId: NodeId,
    expanded: NodeId[],
    changedFiles: string[],
  ): Promise<RefreshResult> {
    const response = await this.request({
      kind: "refresh",
      tsconfig,
      focusId,
      expanded,
      changedFiles,
    });
    if (response.kind !== "refreshed") {
      throw new Error(`Unexpected worker response: ${response.kind}`);
    }
    return response.result;
  }

  async resolveEnd(
    file: string,
    line: number,
    character: number,
    changedFiles: string[],
  ): Promise<ResolvedEnd | undefined> {
    const response = await this.request({
      kind: "resolveEnd",
      file,
      line,
      character,
      changedFiles,
    });
    if (response.kind !== "resolved") {
      throw new Error(`Unexpected worker response: ${response.kind}`);
    }
    return response.result;
  }

  findPath(
    args: FindPathArgs,
    onProgress: (progress: PathProgress) => void,
  ): PathRun<FindPathResult> {
    return startPathRun(
      async (cancel) => {
        const response = await this.request(
          { kind: "findPath", ...args, cancel },
          onProgress,
        );
        if (response.kind !== "pathDone") {
          throw new Error(`Unexpected worker response: ${response.kind}`);
        }
        return response.result;
      },
      (result) => result.outcome.status === "cancelled",
    );
  }

  refreshPath(
    tsconfig: string,
    focusId: NodeId,
    endId: NodeId,
    expanded: NodeId[],
    changedFiles: string[],
    limits: PathLimits,
    onProgress: (progress: PathProgress) => void,
  ): PathRun<RefreshResult> {
    return startPathRun(
      async (cancel) => {
        const response = await this.request(
          {
            kind: "refresh",
            tsconfig,
            focusId,
            expanded,
            changedFiles,
            path: { endId, limits, cancel },
          },
          onProgress,
        );
        if (response.kind !== "refreshed") {
          throw new Error(`Unexpected worker response: ${response.kind}`);
        }
        return response.result;
      },
      (result) => result.pathStatus === "cancelled",
    );
  }

  /** Drops the current worker; the next request starts a fresh one. */
  recycle(): void {
    const worker = this.worker;
    this.worker = undefined;
    if (worker) void worker.terminate().catch(() => undefined);
    this.rejectAll(new Error("The Code Spider analysis worker was restarted."));
  }

  dispose(): void {
    this.disposed = true;
    this.recycle();
  }

  private request(
    body: WorkerRequestBody,
    onProgress?: (progress: PathProgress) => void,
  ): Promise<WorkerResponse> {
    if (this.disposed) {
      return Promise.reject(
        new Error("The Code Spider analysis worker was disposed."),
      );
    }
    const worker = this.worker ?? this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, onProgress });
      worker.postMessage({ ...body, id });
    });
  }

  private start(): WorkerLike {
    const worker = this.spawn();
    this.worker = worker;
    worker.on("message", (message) => this.onMessage(worker, message));
    worker.on("error", (error) => this.onCrash(worker, error));
    worker.on("exit", (code) =>
      this.onCrash(worker, new Error(`exited with code ${code}`)),
    );
    return worker;
  }

  private onMessage(worker: WorkerLike, response: WorkerResponse): void {
    if (worker !== this.worker) return;
    const waiting = this.waiting.get(response.id);
    if (!waiting) return;
    if (response.kind === "pathProgress") {
      try {
        waiting.onProgress?.(response.progress);
      } catch {
        // a failing progress callback must not stop the run
      }
      return;
    }
    this.waiting.delete(response.id);
    if (response.kind === "failed") waiting.reject(new Error(response.message));
    else waiting.resolve(response);
  }

  private onCrash(worker: WorkerLike, error: Error): void {
    if (worker !== this.worker) return;
    this.worker = undefined;
    void worker.terminate().catch(() => undefined);
    const outOfMemory =
      (error as { code?: unknown }).code === "ERR_WORKER_OUT_OF_MEMORY";
    this.rejectAll(
      new WorkerCrashedError(
        outOfMemory
          ? "The analysis worker ran out of memory."
          : `The analysis worker stopped: ${error.message}`,
        outOfMemory,
      ),
    );
  }

  private rejectAll(error: Error): void {
    const all = [...this.waiting.values()];
    this.waiting.clear();
    for (const waiting of all) waiting.reject(error);
  }
}
