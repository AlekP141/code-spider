import type { NodeId } from "@code-spider/core";
import type {
  ExpandResult,
  FocusResult,
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

  private request(body: WorkerRequestBody): Promise<WorkerResponse> {
    if (this.disposed) {
      return Promise.reject(
        new Error("The Code Spider analysis worker was disposed."),
      );
    }
    const worker = this.worker ?? this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
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
